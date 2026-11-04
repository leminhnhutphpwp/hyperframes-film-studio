#!/usr/bin/env node
// ============================================================
//  publish/facebook/video.js — đăng NGUYÊN tập lên fanpage + bình luận link YouTube
//
//  File đăng do người làm phim đưa vào (--video=<file>): studio KHÔNG dựng bản fanpage nữa (trình dựng
//  fanpage-video.js của pipeline cũ không chuyển sang). Luật cũ vẫn giữ: nguyên tập, khung dọc 9:16
//  1080×1920, có tên truyện ở đầu khung.
//
//  Chạy:  node publish/facebook/video.js <thư-mục-project> --video=<file.mp4>          # kiểm tra + xem trước (không đăng)
//         node publish/facebook/video.js <thư-mục-project> --video=<file.mp4> --yes    # đạt hết mới đăng (khi chủ kênh bảo)
//         node publish/facebook/video.js <thư-mục-project> --thumb-only [--yes]        # đặt lại ảnh bìa cho bài đã đăng
//         node publish/facebook/video.js <thư-mục-project> --comment-only [--yes]      # gửi bình luận link còn thiếu
//         node publish/facebook/video.js <thư-mục-project> --check-playlist           # bài đã nằm trong danh sách phát chưa
//    --cover=<file.jpg>  ảnh bìa (mặc định publish/facebook_cover.jpg)
//    --source=<file.mp4> bản dựng chính để so độ dài (mặc định video YouTube của project trong out/ hoặc kho lưu trữ)
//    --at "YYYY-MM-DD HH:MM"  hẹn giờ (giờ Việt Nam) — chỉ khi chủ kênh yêu cầu; sau giờ đăng chạy --comment-only --yes
//    --again             đăng lại project đã có bài
//  Danh sách phát: "playlist" trong publish/youtube-meta.json (tên như YouTube) → id trong channels/<kênh>/channel.js
//  facebook.playlists. API chỉ đọc được danh sách phát → sau khi đăng, thêm bài trên Business Suite rồi --check-playlist.
//
//  Nội dung: publish/facebook_post.txt — bài; phần sau dòng "---" là bình luận đầu (chủ kênh duyệt).
//  Trước khi đăng luôn chạy lib/facebook-check.js checkFullVideo (khung dọc 9:16, nguyên tập, khung đầu, âm thanh,
//  ảnh bìa, hashtag, link đúng tập, video YouTube công khai). ✗ là dừng.
//  Ghi publish/facebook.json → { videoId, url, commentId, postedAt }. Nhãn AI: chủ kênh tự gắn trên web.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const FB = require('../lib/facebook');
const { checkFullVideo } = require('../lib/facebook-check');
const { open, readPost, youtubeStatus } = require('../lib/facebook-project');
const { args, fail } = require('../lib/cli');

// Id bài trên Facebook: tập đăng nguyên lưu ở videoId, tập cũ (Reel) ở reelId.
const fbPostId = (fbs) => fbs.videoId || fbs.reelId || null;

function parseAt(s) {
  if (s === undefined) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) throw new Error('--at phải có dạng "YYYY-MM-DD HH:MM" (giờ Việt Nam)');
  const at = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:00+07:00`);
  const mins = (at - Date.now()) / 60000;
  if (mins < 10 || mins > 29 * 24 * 60) throw new Error('Facebook chỉ nhận hẹn giờ từ 10 phút tới 29 ngày tới');
  return at;
}

async function main() {
  const a = args();
  const target = a.pos[0];
  if (!target) throw new Error('Cách dùng: node publish/facebook/video.js <thư-mục-project> --video=<file.mp4> [--yes] [--again] [--thumb-only|--comment-only|--check-playlist]');
  const yes = a.has('yes');
  const publishAt = parseAt(a.flags.at);

  const P = open(target);
  const fbs = P.state;
  const cover = typeof a.flags.cover === 'string' ? path.resolve(a.flags.cover) : path.join(P.pub, 'facebook_cover.jpg');
  const tok = FB.loadPageToken(P.ch);
  const playlists = (P.ch.config.facebook || {}).playlists || {};
  const pl = { title: P.meta.playlist || '(chưa có)', id: (P.meta.playlist && playlists[P.meta.playlist]) || null };

  if (a.has('check-playlist')) {
    if (!fbPostId(fbs)) throw new Error('Project này chưa đăng lên fanpage');
    if (!pl.id) throw new Error(`Không biết id danh sách phát "${pl.title}" — thêm vào channels/${P.ch.id}/channel.js facebook.playlists`);
    const has = (await FB.playlistVideoIds(pl.id, tok.access_token)).includes(String(fbPostId(fbs)));
    console.log(has ? `✅ Bài đã nằm trong danh sách phát "${pl.title}"` : `✗ Bài CHƯA nằm trong "${pl.title}" — thêm trên Business Suite`);
    if (!has) process.exitCode = 2;
    return;
  }
  if (a.has('thumb-only')) {
    if (!fbPostId(fbs)) throw new Error('Chưa có bài nào để đặt ảnh bìa');
    if (!fs.existsSync(cover)) throw new Error(`Chưa có ${studio.rel(cover)}`);
    if (!yes) { console.log(`Sẽ đặt ảnh bìa ${studio.rel(cover)} cho ${fbs.url} (thêm --yes)`); return; }
    await FB.setThumbnail(fbPostId(fbs), tok.access_token, cover);
    console.log(`✅ Đã đặt ảnh bìa cho ${fbs.url}`);
    return;
  }
  const post = readPost(path.join(P.pub, 'facebook_post.txt'));
  if (a.has('comment-only')) {
    if (!fbPostId(fbs)) throw new Error('Chưa có bài nào để bình luận');
    if (fbs.commentId) throw new Error('Bài này đã có bình luận link rồi');
    if (!post.comment) throw new Error('facebook_post.txt chưa có bình luận (phần sau ---)');
    if (!yes) { console.log(`Sẽ bình luận dưới ${fbs.url}:\n   ${post.comment}\n(thêm --yes)`); return; }
    fbs.commentId = (await FB.comment(fbPostId(fbs), tok.access_token, post.comment)).id;
    P.save();
    console.log(`✅ Đã bình luận link dưới ${fbs.url}`);
    return;
  }
  if (fbPostId(fbs) && !a.has('again')) {
    throw new Error(`Project này đã lên fanpage rồi: ${fbs.url || fbPostId(fbs)} — thêm --again nếu chủ kênh muốn đăng lại`);
  }
  if (typeof a.flags.video !== 'string') throw new Error('Cần --video=<file.mp4> (bản fanpage: nguyên tập, khung dọc 1080×1920).');
  const video = path.resolve(a.flags.video);
  let source = null;
  try { source = typeof a.flags.source === 'string' ? path.resolve(a.flags.source) : studio.findProjectVideo(P.project, 'vi'); } catch (e) { console.log(`⚠️  ${e.message}`); }

  // ---------- kiểm tra ----------
  const title = String(P.meta.title || '').trim();
  console.log(`Trang: ${tok.pageName} (${tok.pageId}) · ${studio.rel(P.project)} · YouTube ${P.youtubeId || '(chưa đăng)'}`);
  console.log(`Video: ${video}\nBản dựng chính: ${source || '(không thấy)'}`);
  const checks = checkFullVideo({
    state: { videoId: P.youtubeId, videoPath: source }, video, cover, post, title,
    ytStatus: await youtubeStatus(P.ch, P.youtubeId),
  });
  const used = await FB.videosLast24h(tok.pageId, tok.access_token);
  checks.push({ ok: used < 50, item: 'Số video trang đăng trong 24 giờ', detail: `đã đăng ${used}` });
  for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.item}: ${c.detail}`);
  console.log(`Nội dung:\n${post.description.replace(/^/gm, '   │ ')}`);
  console.log(`Bình luận: ${post.comment || '(không có)'}`);
  if (publishAt) console.log(`Hẹn giờ: ${publishAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) throw new Error(`${bad.length} mục chưa đạt — sửa xong mới đăng: ${bad.map((c) => c.item).join(', ')}`);
  if (!yes) { console.log('\n✓ Đạt hết. (Xem trước — chưa đăng; chủ kênh bảo đăng thì chạy lại với --yes.)'); return; }

  // ---------- đăng ----------
  console.log(`\nĐang tải nguyên tập lên (${(fs.statSync(video).size / 1e6).toFixed(0)} MB)…`);
  const videoId = await FB.uploadVideo({ pageId: tok.pageId, token: tok.access_token, file: video, description: post.description, title, publishAt });
  if (publishAt) {
    Object.assign(fbs, { videoId, url: `https://www.facebook.com/${videoId}`, commentId: null, scheduledFor: publishAt.toISOString() });
    P.save();
    console.log(`✅ Đã hẹn giờ bài video ${videoId}. Sau giờ đăng: node publish/facebook/video.js ${studio.rel(P.project)} --comment-only --yes`);
    return;
  }
  // Ghi dấu NGAY: nếu bước chờ xử lý đứt giữa chừng thì bài vẫn đã lên trang, đừng để đăng trùng.
  Object.assign(fbs, { videoId, url: `https://www.facebook.com/${videoId}`, commentId: null, postedAt: new Date().toISOString() });
  P.save();
  const d = await FB.waitReady(videoId, tok.access_token, { log: console.log });
  fbs.url = d.permalink_url ? new URL(d.permalink_url, 'https://www.facebook.com').href : `https://www.facebook.com/${videoId}`;
  P.save();
  const notes = [];
  if (fs.existsSync(cover)) {
    try { await FB.setThumbnail(videoId, tok.access_token, cover); notes.push('ảnh bìa'); } catch (e) { console.log(`⚠️  Ảnh bìa: ${e.message} (chạy lại --thumb-only --yes)`); }
  }
  if (post.comment) {
    try {
      fbs.commentId = (await FB.comment(videoId, tok.access_token, post.comment)).id;
      P.save();
      notes.push('bình luận link YouTube');
    } catch (e) { console.log(`⚠️  Bình luận: ${e.message} (chạy lại --comment-only --yes)`); }
  }
  console.log(`✅ Đã đăng video: ${fbs.url}${notes.length ? `\n   + ${notes.join(' + ')}` : ''}`);
  console.log(`   Còn lại: thêm vào danh sách phát "${pl.title}" trên Business Suite (API không làm được)`
    + `${pl.id ? `\n   business.facebook.com/latest/posts/playlist_details?asset_id=${tok.pageId}&videolist_id=${pl.id}` : ''}`
    + `\n   rồi kiểm tra: node publish/facebook/video.js ${studio.rel(P.project)} --check-playlist`);
}

main().catch(fail);
