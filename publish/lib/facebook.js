// ============================================================
//  publish/lib/facebook.js — gọi Meta Graph API cho fanpage của một kênh
//
//  Dùng app riêng ở chế độ Development (chỉ tài khoản của người dùng, không cần
//  Meta duyệt). Token của TRANG nằm ở secrets/<kênh>/facebook-token.json (git-ignored),
//  do publish/facebook/auth.js tạo.
//  Trang của kênh: channels/<kênh>/channel.js → facebook.pageId.
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
  if (!id) throw new Error(`Kênh ${ch.id} chưa có fanpage (channels/${ch.id}/channel.js → facebook.pageId).`);
  return String(id);
};
const VERSION = process.env.FB_GRAPH_VERSION || 'v25.0'; // bản hiện hành trong tài liệu Reels (09/2026)
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/video-upload/${VERSION}`;

// Lỗi Graph API -> Error có message dễ đọc (không in token).
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
  const pageId = pageIdOf(ch); // kênh không có fanpage thì dừng ở đây
  const file = tokenPath(ch);
  if (!fs.existsSync(file)) {
    throw new Error(`Chưa có token trang Facebook (${rel(file)}) — chạy node publish/facebook/auth.js --channel=${ch.id}`);
  }
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (String(t.pageId) !== pageId) {
    throw new Error(`Token là của trang ${t.pageName} (${t.pageId}), không phải trang kênh (${pageId}) — chạy lại publish/facebook/auth.js`);
  }
  return t;
}

// Đăng Reel 3 bước: start -> tải file lên rupload -> finish (PUBLISHED). Trả video_id.
// Đăng Reel theo tài liệu developers.facebook.com/docs/video-api/guides/reels-publishing:
//   1) POST /{page}/video_reels upload_phase=start → video_id, upload_url
//   2) POST upload_url (rupload) với header Authorization/offset/file_size, thân là file → {success:true}
//   3) POST /{page}/video_reels upload_phase=finish video_state=PUBLISHED|SCHEDULED (+scheduled_publish_time)
// publishAt (Date, tùy chọn): hẹn giờ — Facebook nhận từ 10 phút tới 29 ngày tới.
async function uploadReel({ pageId, token, file, description, publishAt = null }) {
  const start = await post(`${pageId}/video_reels`, { upload_phase: 'start', access_token: token });
  const videoId = start.video_id;
  if (!videoId) throw new Error(`Bước start không trả video_id: ${JSON.stringify(start).slice(0, 200)}`);
  const buf = fs.readFileSync(file);
  const up = await graphFetch(start.upload_url || `${RUPLOAD}/${videoId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(buf.length) },
    body: buf,
  });
  if (up.success !== true) throw new Error(`Tải file lên chưa thành công: ${JSON.stringify(up).slice(0, 200)}`);
  // Kiểm tra Facebook đã nhận đủ byte trước khi finish.
  const st = (await get(videoId, { fields: 'status', access_token: token })).status || {};
  const got = st.uploading_phase && Number(st.uploading_phase.bytes_transfered);
  if (got && got !== buf.length) throw new Error(`Facebook mới nhận ${got}/${buf.length} byte`);
  const fin = await post(`${pageId}/video_reels`, {
    upload_phase: 'finish', video_id: videoId, description, access_token: token,
    video_state: publishAt ? 'SCHEDULED' : 'PUBLISHED',
    scheduled_publish_time: publishAt ? Math.floor(publishAt.getTime() / 1000) : undefined,
  });
  if (fin.success !== true) throw new Error(`Bước finish chưa thành công: ${JSON.stringify(fin).slice(0, 200)}`);
  return videoId;
}

// Chờ Facebook xử lý + đăng. status.video_status: uploading | upload_complete | processing | ready |
// error | expired | upload_failed; publishing_phase.status / publish_status (published|scheduled|draft|error).
const FAIL = new Set(['error', 'expired', 'upload_failed']);
// Ngay sau khi tải lên, Graph có lúc chưa thấy object: "does not exist, cannot be loaded due to
// missing permissions" (code 100/33). Video VẪN đang xử lý — chờ rồi hỏi lại, đừng bỏ cuộc
// (gặp 21/09/2026: bài "Ăn Trộm Mèo Của Chúa" lên trang nhưng script dừng, mất ảnh bìa + bình luận).
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
      if (notYet === 1) log('   … Graph chưa thấy video, chờ rồi hỏi lại');
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }
    const st = d.status || {};
    const pp = st.processing_phase || {};
    const pub = st.publishing_phase || {};
    const phase = `${st.video_status || '?'} · xử lý ${pp.status || '?'} · đăng ${pub.status || '?'}${pub.publish_status ? '/' + pub.publish_status : ''}`;
    if (phase !== last) { log(`   … ${phase}`); last = phase; }
    if (FAIL.has(st.video_status) || pp.status === 'error' || pub.status === 'error' || pub.publish_status === 'error') {
      throw new Error(`Facebook báo lỗi video ${videoId}: ${JSON.stringify(st).slice(0, 400)}`);
    }
    // Reel báo publishing_phase; bài video thường có thể không có -> 'ready' là xong.
    if (st.video_status === 'ready' && (pub.status === 'complete' || !pub.status)) return d;
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`Hết ${timeoutSec}s mà Facebook chưa xử lý xong video ${videoId} — kiểm tra lại trên trang`);
}

// Đăng NGUYÊN video lên trang (POST /{page-id}/videos, multipart 'source') -> video_id.
// Khác Reel: khung ngang, dài bao lâu cũng được — từ 21/09/2026 fanpage đăng full, không cắt teaser.
// publishAt (Date, tùy chọn): hẹn giờ (published=false + scheduled_publish_time).
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
  if (!r.id) throw new Error(`Facebook không trả video id: ${JSON.stringify(r).slice(0, 200)}`);
  return r.id;
}

// Số video trang đã đăng trong 24 giờ qua (trang thường bị chặn quanh 50 bài / 24 giờ).
async function videosLast24h(pageId, token) {
  const since = Date.now() - 24 * 3600 * 1000;
  const r = await get(`${pageId}/videos`, { fields: 'id,created_time', limit: 100, access_token: token });
  return (r.data || []).filter((x) => new Date(x.created_time).getTime() >= since).length;
}

// Đặt ảnh bìa (POST /{video-id}/thumbnails, source + is_preferred=true; ≤10 MB, cùng tỉ lệ video;
// cần pages_read_user_content + pages_manage_engagement).
async function setThumbnail(videoId, token, file) {
  const fd = new FormData();
  fd.set('access_token', token);
  fd.set('is_preferred', 'true');
  fd.set('source', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
  return graphFetch(`${GRAPH}/${videoId}/thumbnails`, { method: 'POST', body: fd });
}

// Số Reel trang đã đăng trong 24 giờ qua (giới hạn API: 30 bài / 24 giờ trượt).
async function reelsLast24h(pageId, token) {
  const since = Date.now() - 24 * 3600 * 1000;
  const r = await get(`${pageId}/video_reels`, { fields: 'id,created_time', limit: 50, access_token: token });
  return (r.data || []).filter((x) => new Date(x.created_time).getTime() >= since).length;
}

// Id các video trong một danh sách phát (chỉ đọc — Graph API không cho thêm/sửa danh sách phát).
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

// Bài có ẢNH trên trang (POST /{page-id}/photos, published=true) -> { id: ảnh, post_id: bài }. Cần pages_manage_posts.
async function uploadPhoto({ pageId, token, file, message }) {
  const fd = new FormData();
  fd.set('access_token', token);
  fd.set('message', message);
  fd.set('published', 'true');
  fd.set('source', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
  return graphFetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: fd });
}

// Bình luận của NGƯỜI XEM (không phải trang) mà trang CHƯA trả lời, trên các bài gần đây của trang.
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
      if (!replied) out.push({ commentId: c.id, from: (c.from || {}).name || '(ẩn danh)', message: c.message || '', createdTime: c.created_time,
        postId: p.id, postText: (p.message || '').split('\n')[0].slice(0, 120), postUrl: p.permalink_url });
    }
  }
  return out;
}

module.exports = { tokenPath, pageIdOf, VERSION, GRAPH, get, post, loadPageToken, uploadReel, uploadVideo, videosLast24h, waitReady, comment, setThumbnail, reelsLast24h, playlistVideoIds, uploadPhoto, unansweredComments };
