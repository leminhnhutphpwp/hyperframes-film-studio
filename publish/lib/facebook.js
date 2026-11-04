// ============================================================
//  publish/lib/facebook.js — Meta Graph API calls for a channel's fanpage
//
//  Uses a dedicated app in Development mode (only your own accounts, no Meta
//  review needed). The PAGE token lives in secrets/<channel>/facebook-token.json (git-ignored),
//  created by publish/facebook/auth.js.
//  The channel's page: channels/<channel>/channel.js → facebook.pageId.
// ============================================================

'use strict';

const { rel } = require('./studio');

const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');
const { Blob } = require('buffer');

const tokenPath = (ch) => path.join(ch.secrets, 'facebook-token.json');
const pageIdOf = (ch) => {
  const id = ch.config.facebook && ch.config.facebook.pageId;
  if (!id) throw new Error(`Channel ${ch.id} has no fanpage (channels/${ch.id}/channel.js → facebook.pageId).`);
  return String(id);
};
const VERSION = process.env.FB_GRAPH_VERSION || 'v25.0'; // current version in the Reels docs at time of writing
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/video-upload/${VERSION}`;

// Graph API errors -> Error with a readable message (the token is never printed).
async function graphFetch(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`Graph API ${res.status}: ${e.message || text.slice(0, 300)}${e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : ''}`);
  }
  return data;
}

function form(params) {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) f.set(k, String(v));
  return f;
}

const get = (p, params) => graphFetch(`${GRAPH}/${p}?${form(params)}`);
const post = (p, params) => graphFetch(`${GRAPH}/${p}`, { method: 'POST', body: form(params) });

function loadPageToken(ch) {
  const pageId = pageIdOf(ch); // stops here if the channel has no fanpage
  const file = tokenPath(ch);
  if (!fs.existsSync(file)) {
    throw new Error(`No Facebook page token yet (${rel(file)}) — run node publish/facebook/auth.js --channel=${ch.id}`);
  }
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (String(t.pageId) !== pageId) {
    throw new Error(`Token belongs to page ${t.pageName} (${t.pageId}), not the channel's page (${pageId}) — run publish/facebook/auth.js again`);
  }
  return t;
}

// Post a Reel in 3 steps: start -> upload the file to rupload -> finish (PUBLISHED). Returns video_id.
// Reel posting per developers.facebook.com/docs/video-api/guides/reels-publishing:
//   1) POST /{page}/video_reels upload_phase=start → video_id, upload_url
//   2) POST upload_url (rupload) with Authorization/offset/file_size headers, body is the file → {success:true}
//   3) POST /{page}/video_reels upload_phase=finish video_state=PUBLISHED|SCHEDULED (+scheduled_publish_time)
// publishAt (Date, optional): schedule — Facebook accepts 10 minutes to 29 days ahead.
async function uploadReel({ pageId, token, file, description, publishAt = null }) {
  const start = await post(`${pageId}/video_reels`, { upload_phase: 'start', access_token: token });
  const videoId = start.video_id;
  if (!videoId) throw new Error(`Start step returned no video_id: ${JSON.stringify(start).slice(0, 200)}`);
  const buf = fs.readFileSync(file);
  const up = await graphFetch(start.upload_url || `${RUPLOAD}/${videoId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(buf.length) },
    body: buf,
  });
  if (up.success !== true) throw new Error(`File upload did not succeed: ${JSON.stringify(up).slice(0, 200)}`);
  // Check that Facebook received every byte before finishing.
  const st = (await get(videoId, { fields: 'status', access_token: token })).status || {};
  const got = st.uploading_phase && Number(st.uploading_phase.bytes_transfered);
  if (got && got !== buf.length) throw new Error(`Facebook has only received ${got}/${buf.length} bytes`);
  const fin = await post(`${pageId}/video_reels`, {
    upload_phase: 'finish', video_id: videoId, description, access_token: token,
    video_state: publishAt ? 'SCHEDULED' : 'PUBLISHED',
    scheduled_publish_time: publishAt ? Math.floor(publishAt.getTime() / 1000) : undefined,
  });
  if (fin.success !== true) throw new Error(`Finish step did not succeed: ${JSON.stringify(fin).slice(0, 200)}`);
  return videoId;
}

// Wait for Facebook to process + publish. status.video_status: uploading | upload_complete | processing | ready |
// error | expired | upload_failed; publishing_phase.status / publish_status (published|scheduled|draft|error).
const FAIL = new Set(['error', 'expired', 'upload_failed']);
// Right after upload, Graph sometimes cannot see the object yet: "does not exist, cannot be loaded due to
// missing permissions" (code 100/33). The video IS still processing — wait and ask again, do not give up
// (otherwise the post goes live but the script stops before setting the cover and posting the comment).
const NOT_YET = /does not exist|cannot be loaded|Unsupported get request/i;
async function waitReady(videoId, token, { timeoutSec = 900, log = () => {} } = {}) {
  const t0 = Date.now();
  let last = '';
  let notYet = 0;
  while ((Date.now() - t0) / 1000 < timeoutSec) {
    let d;
    try {
      d = await get(videoId, { fields: 'status,permalink_url', access_token: token });
    } catch (e) {
      if (!NOT_YET.test(e.message) || ++notYet > 12) throw e;
      if (notYet === 1) log('   … Graph cannot see the video yet, waiting before asking again');
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }
    const st = d.status || {};
    const pp = st.processing_phase || {};
    const pub = st.publishing_phase || {};
    const phase = `${st.video_status || '?'} · processing ${pp.status || '?'} · publishing ${pub.status || '?'}${pub.publish_status ? '/' + pub.publish_status : ''}`;
    if (phase !== last) { log(`   … ${phase}`); last = phase; }
    if (FAIL.has(st.video_status) || pp.status === 'error' || pub.status === 'error' || pub.publish_status === 'error') {
      throw new Error(`Facebook reported an error for video ${videoId}: ${JSON.stringify(st).slice(0, 400)}`);
    }
    // Reels report publishing_phase; regular video posts may not -> 'ready' means done.
    if (st.video_status === 'ready' && (pub.status === 'complete' || !pub.status)) return d;
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`Facebook did not finish processing video ${videoId} within ${timeoutSec}s — check the page`);
}

// Post the FULL video to the page (POST /{page-id}/videos, multipart 'source') -> video_id.
// Unlike a Reel: no 9:16 or length limit — the fanpage posts full episodes, not teaser cuts.
// publishAt (Date, optional): schedule (published=false + scheduled_publish_time).
async function uploadVideo({ pageId, token, file, description, title = null, publishAt = null }) {
  const fd = new FormData();
  fd.set('access_token', token);
  fd.set('description', description);
  if (title) fd.set('title', title);
  if (publishAt) {
    fd.set('published', 'false');
    fd.set('scheduled_publish_time', String(Math.floor(publishAt.getTime() / 1000)));
  }
  fd.set('source', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), path.basename(file));
  const r = await graphFetch(`${GRAPH}/${pageId}/videos`, { method: 'POST', body: fd });
  if (!r.id) throw new Error(`Facebook returned no video id: ${JSON.stringify(r).slice(0, 200)}`);
  return r.id;
}

// Number of videos the page posted in the last 24 hours (pages tend to get blocked around 50 posts / 24 hours).
async function videosLast24h(pageId, token) {
  const since = Date.now() - 24 * 3600 * 1000;
  const r = await get(`${pageId}/videos`, { fields: 'id,created_time', limit: 100, access_token: token });
  return (r.data || []).filter((x) => new Date(x.created_time).getTime() >= since).length;
}

// Set the cover image (POST /{video-id}/thumbnails, source + is_preferred=true; ≤10 MB, same aspect ratio as the video;
// needs pages_read_user_content + pages_manage_engagement).
async function setThumbnail(videoId, token, file) {
  const fd = new FormData();
  fd.set('access_token', token);
  fd.set('is_preferred', 'true');
  fd.set('source', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
  return graphFetch(`${GRAPH}/${videoId}/thumbnails`, { method: 'POST', body: fd });
}

// Number of Reels the page posted in the last 24 hours (API limit: 30 posts / rolling 24 hours).
async function reelsLast24h(pageId, token) {
  const since = Date.now() - 24 * 3600 * 1000;
  const r = await get(`${pageId}/video_reels`, { fields: 'id,created_time', limit: 50, access_token: token });
  return (r.data || []).filter((x) => new Date(x.created_time).getTime() >= since).length;
}

// Video ids in a playlist (read-only — the Graph API cannot add to or edit playlists).
async function playlistVideoIds(listId, token) {
  const ids = [];
  let url = `${GRAPH}/${listId}/videos?${form({ fields: 'id', limit: 100, access_token: token })}`;
  while (url) {
    const r = await graphFetch(url);
    for (const v of r.data || []) ids.push(String(v.id));
    url = r.paging && r.paging.next;
  }
  return ids;
}

const comment = (objectId, token, message) => post(`${objectId}/comments`, { message, access_token: token });

// PHOTO post on the page (POST /{page-id}/photos, published=true) -> { id: photo, post_id: post }. Needs pages_manage_posts.
async function uploadPhoto({ pageId, token, file, message }) {
  const fd = new FormData();
  fd.set('access_token', token);
  fd.set('message', message);
  fd.set('published', 'true');
  fd.set('source', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
  return graphFetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: fd });
}

// Comments from VIEWERS (not the page) that the page has NOT replied to, on the page's recent posts.
async function unansweredComments(pageId, token, { posts = 50 } = {}) {
  const r = await get(`${pageId}/feed`, {
    fields: 'id,message,permalink_url,created_time,comments.limit(100){id,from,message,created_time,comments.limit(50){from}}',
    limit: posts, access_token: token,
  });
  const out = [];
  for (const p of r.data || []) {
    for (const c of ((p.comments || {}).data || [])) {
      if (c.from && String(c.from.id) === String(pageId)) continue;
      const replied = ((c.comments || {}).data || []).some((x) => x.from && String(x.from.id) === String(pageId));
      if (!replied) out.push({ commentId: c.id, from: (c.from || {}).name || '(anonymous)', message: c.message || '', createdTime: c.created_time,
        postId: p.id, postText: (p.message || '').split('\n')[0].slice(0, 120), postUrl: p.permalink_url });
    }
  }
  return out;
}

module.exports = { tokenPath, pageIdOf, VERSION, GRAPH, get, post, loadPageToken, uploadReel, uploadVideo, videosLast24h, waitReady, comment, setThumbnail, reelsLast24h, playlistVideoIds, uploadPhoto, unansweredComments };
