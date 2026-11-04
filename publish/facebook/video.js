#!/usr/bin/env node
// ============================================================
//  publish/facebook/video.js — posts the FULL episode to the fanpage + a YouTube link comment
//
//  The file to post is supplied by the filmmaker (--video=<file>): the studio NO LONGER renders the fanpage version (the
//  old pipeline's fanpage-video.js renderer was not carried over). The old rules still apply: full episode, vertical 9:16
//  1080×1920, story title at the top of the frame.
//
//  Run:  node publish/facebook/video.js <project-folder> --video=<file.mp4>          # check + preview (no posting)
//        node publish/facebook/video.js <project-folder> --video=<file.mp4> --yes    # posts only if every check passes (when the channel owner says so)
//        node publish/facebook/video.js <project-folder> --thumb-only [--yes]        # set the cover image again on an existing post
//        node publish/facebook/video.js <project-folder> --comment-only [--yes]      # send a missing link comment
//        node publish/facebook/video.js <project-folder> --check-playlist           # is the post in the playlist yet
//    --cover=<file.jpg>  cover image (default publish/facebook_cover.jpg)
//    --source=<file.mp4> main render to compare durations against (default: the project's YouTube video in out/ or the archive)
//    --at "YYYY-MM-DD HH:MM"  schedule (Vietnam time, UTC+7) — only when the channel owner asks; after the post time run --comment-only --yes
//    --again             post again for a project that already has a post
//  Playlist: "playlist" in publish/youtube-meta.json (same name as on YouTube) → id in channels/<channel>/channel.js
//  facebook.playlists. The API can only read playlists → after posting, add the post in Business Suite, then run --check-playlist.
//
//  Text: publish/facebook_post.txt — the post; the part after the "---" line is the first comment (approved by the channel owner).
//  Before posting it always runs lib/facebook-check.js checkFullVideo (vertical 9:16, full episode, first frame, audio,
//  cover, hashtags, link to the right episode, YouTube video public). Any ✗ stops the run.
//  Writes publish/facebook.json → { videoId, url, commentId, postedAt }. AI label: the channel owner adds it on the web.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const FB = require('../lib/facebook');
const { checkFullVideo } = require('../lib/facebook-check');
const { open, readPost, youtubeStatus } = require('../lib/facebook-project');
const { args, fail } = require('../lib/cli');

// Facebook post id: full-episode posts store it in videoId, older (Reel) episodes in reelId.
const fbPostId = (fbs) => fbs.videoId || fbs.reelId || null;

function parseAt(s) {
  if (s === undefined) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) throw new Error('--at must look like "YYYY-MM-DD HH:MM" (Vietnam time)');
  const at = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:00+07:00`);
  const mins = (at - Date.now()) / 60000;
  if (mins < 10 || mins > 29 * 24 * 60) throw new Error('Facebook only accepts a schedule from 10 minutes to 29 days ahead');
  return at;
}

async function main() {
  const a = args();
  const target = a.pos[0];
  if (!target) throw new Error('Usage: node publish/facebook/video.js <project-folder> --video=<file.mp4> [--yes] [--again] [--thumb-only|--comment-only|--check-playlist]');
  const yes = a.has('yes');
  const publishAt = parseAt(a.flags.at);

  const P = open(target);
  const fbs = P.state;
  const cover = typeof a.flags.cover === 'string' ? path.resolve(a.flags.cover) : path.join(P.pub, 'facebook_cover.jpg');
  const tok = FB.loadPageToken(P.ch);
  const playlists = (P.ch.config.facebook || {}).playlists || {};
  const pl = { title: P.meta.playlist || '(not set)', id: (P.meta.playlist && playlists[P.meta.playlist]) || null };

  if (a.has('check-playlist')) {
    if (!fbPostId(fbs)) throw new Error('This project has not been posted to the fanpage yet');
    if (!pl.id) throw new Error(`Unknown id for playlist "${pl.title}" — add it to channels/${P.ch.id}/channel.js facebook.playlists`);
    const has = (await FB.playlistVideoIds(pl.id, tok.access_token)).includes(String(fbPostId(fbs)));
    console.log(has ? `✅ The post is in playlist "${pl.title}"` : `✗ The post is NOT in "${pl.title}" yet — add it in Business Suite`);
    if (!has) process.exitCode = 2;
    return;
  }
  if (a.has('thumb-only')) {
    if (!fbPostId(fbs)) throw new Error('No post to set a cover image on');
    if (!fs.existsSync(cover)) throw new Error(`Missing ${studio.rel(cover)}`);
    if (!yes) { console.log(`Will set cover ${studio.rel(cover)} on ${fbs.url} (add --yes)`); return; }
    await FB.setThumbnail(fbPostId(fbs), tok.access_token, cover);
    console.log(`✅ Set the cover image on ${fbs.url}`);
    return;
  }
  const post = readPost(path.join(P.pub, 'facebook_post.txt'));
  if (a.has('comment-only')) {
    if (!fbPostId(fbs)) throw new Error('No post to comment on');
    if (fbs.commentId) throw new Error('This post already has a link comment');
    if (!post.comment) throw new Error('facebook_post.txt has no comment (the part after ---)');
    if (!yes) { console.log(`Will comment under ${fbs.url}:\n   ${post.comment}\n(add --yes)`); return; }
    fbs.commentId = (await FB.comment(fbPostId(fbs), tok.access_token, post.comment)).id;
    P.save();
    console.log(`✅ Posted the link comment under ${fbs.url}`);
    return;
  }
  if (fbPostId(fbs) && !a.has('again')) {
    throw new Error(`This project is already on the fanpage: ${fbs.url || fbPostId(fbs)} — add --again if the channel owner wants to post it again`);
  }
  if (typeof a.flags.video !== 'string') throw new Error('Needs --video=<file.mp4> (fanpage version: full episode, vertical 1080×1920).');
  const video = path.resolve(a.flags.video);
  let source = null;
  try { source = typeof a.flags.source === 'string' ? path.resolve(a.flags.source) : studio.findProjectVideo(P.project, 'vi'); } catch (e) { console.log(`⚠️  ${e.message}`); }

  // ---------- checks ----------
  const title = String(P.meta.title || '').trim();
  console.log(`Page: ${tok.pageName} (${tok.pageId}) · ${studio.rel(P.project)} · YouTube ${P.youtubeId || '(not uploaded)'}`);
  console.log(`Video: ${video}\nMain render: ${source || '(not found)'}`);
  const checks = checkFullVideo({
    state: { videoId: P.youtubeId, videoPath: source }, video, cover, post, title,
    ytStatus: await youtubeStatus(P.ch, P.youtubeId),
  });
  const used = await FB.videosLast24h(tok.pageId, tok.access_token);
  checks.push({ ok: used < 50, item: 'Videos posted by the page in 24 hours', detail: `${used} posted` });
  for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.item}: ${c.detail}`);
  console.log(`Text:\n${post.description.replace(/^/gm, '   │ ')}`);
  console.log(`Comment: ${post.comment || '(none)'}`);
  if (publishAt) console.log(`Scheduled: ${publishAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) throw new Error(`${bad.length} checks failed — fix them before posting: ${bad.map((c) => c.item).join(', ')}`);
  if (!yes) { console.log('\n✓ All checks passed. (Preview — not posted; when the channel owner says to post, run again with --yes.)'); return; }

  // ---------- post ----------
  console.log(`\nUploading the full episode (${(fs.statSync(video).size / 1e6).toFixed(0)} MB)…`);
  const videoId = await FB.uploadVideo({ pageId: tok.pageId, token: tok.access_token, file: video, description: post.description, title, publishAt });
  if (publishAt) {
    Object.assign(fbs, { videoId, url: `https://www.facebook.com/${videoId}`, commentId: null, scheduledFor: publishAt.toISOString() });
    P.save();
    console.log(`✅ Scheduled video post ${videoId}. After the post time: node publish/facebook/video.js ${studio.rel(P.project)} --comment-only --yes`);
    return;
  }
  // Record it RIGHT AWAY: if waiting for processing breaks midway, the post is already on the page — avoid posting it twice.
  Object.assign(fbs, { videoId, url: `https://www.facebook.com/${videoId}`, commentId: null, postedAt: new Date().toISOString() });
  P.save();
  const d = await FB.waitReady(videoId, tok.access_token, { log: console.log });
  fbs.url = d.permalink_url ? new URL(d.permalink_url, 'https://www.facebook.com').href : `https://www.facebook.com/${videoId}`;
  P.save();
  const notes = [];
  if (fs.existsSync(cover)) {
    try { await FB.setThumbnail(videoId, tok.access_token, cover); notes.push('cover image'); } catch (e) { console.log(`⚠️  Cover image: ${e.message} (rerun with --thumb-only --yes)`); }
  }
  if (post.comment) {
    try {
      fbs.commentId = (await FB.comment(videoId, tok.access_token, post.comment)).id;
      P.save();
      notes.push('YouTube link comment');
    } catch (e) { console.log(`⚠️  Comment: ${e.message} (rerun with --comment-only --yes)`); }
  }
  console.log(`✅ Posted the video: ${fbs.url}${notes.length ? `\n   + ${notes.join(' + ')}` : ''}`);
  console.log(`   Remaining: add it to playlist "${pl.title}" in Business Suite (the API cannot do this)`
    + `${pl.id ? `\n   business.facebook.com/latest/posts/playlist_details?asset_id=${tok.pageId}&videolist_id=${pl.id}` : ''}`
    + `\n   then check: node publish/facebook/video.js ${studio.rel(P.project)} --check-playlist`);
}

main().catch(fail);
