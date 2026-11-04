#!/usr/bin/env node
// ============================================================
//  publish/facebook/photo.js — đăng BÀI CÓ ẢNH lên fanpage + bình luận link YouTube
//
//  Chạy:  node publish/facebook/photo.js <thư-mục-project>                         # kiểm tra + xem trước (không đăng gì)
//         node publish/facebook/photo.js <thư-mục-project> --yes                   # đăng (chỉ khi chủ kênh bảo đăng)
//         node publish/facebook/photo.js <thư-mục-project> --comment-only [--yes]  # gửi bình luận link còn thiếu
//         (--again để đăng lại bài đã có)
//
//  Đọc <project>/publish/: facebook_photo.txt (nội dung; phần sau "---" là bình luận đầu), facebook_photo.jpg
//  (không có thì thumbnail.jpg), youtube.json (videoId để kiểm link). Link để ở bình luận (Facebook đẩy bài có
//  link yếu hơn). Kiểm tra chữ (lib/facebook-check.js checkText): có nội dung, không link trong bài, ≤ 3 hashtag
//  không dấu, link đúng tập, video YouTube đang công khai. Một mục ✗ là dừng.
//  Ghi publish/facebook.json → photo: { postId, photoId, url, commentId, postedAt }.
//  Nhãn AI: API không bật được — chủ kênh tự gắn trên web.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const FB = require('../lib/facebook');
const { checkText } = require('../lib/facebook-check');
const { open, readPost, youtubeStatus } = require('../lib/facebook-project');
const { args, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const target = a.pos[0];
  if (!target) throw new Error('Cách dùng: node publish/facebook/photo.js <thư-mục-project> [--yes] [--comment-only] [--again]');
  const yes = a.has('yes');
  const P = open(target);
  const post = readPost(path.join(P.pub, 'facebook_photo.txt'));
  const tok = FB.loadPageToken(P.ch);
  const done = P.state.photo;

  if (a.has('comment-only')) {
    if (!done || !done.postId) throw new Error('Project này chưa có bài ảnh');
    if (done.commentId) { console.log(`Đã có bình luận ${done.commentId}`); return; }
    if (!post.comment) throw new Error('facebook_photo.txt chưa có bình luận (phần sau ---)');
    if (!yes) { console.log(`Sẽ bình luận vào ${done.postId}:\n${post.comment}\n(thêm --yes để gửi)`); return; }
    done.commentId = (await FB.comment(done.postId, tok.access_token, post.comment)).id;
    P.save();
    console.log(`✅ Đã bình luận ${done.commentId}`);
    return;
  }
  if (done && done.postId && !a.has('again')) { console.log(`Project này đã có bài ảnh: ${done.url || done.postId} (--again để đăng lại)`); return; }

  const own = path.join(P.pub, 'facebook_photo.jpg');
  const img = fs.existsSync(own) ? own : path.join(P.pub, 'thumbnail.jpg');
  if (!fs.existsSync(img)) throw new Error(`Không có ảnh: cần ${studio.rel(own)} hoặc publish/thumbnail.jpg`);
  const checks = checkText({ state: { videoId: P.youtubeId }, post, ytStatus: await youtubeStatus(P.ch, P.youtubeId) });
  const mb = fs.statSync(img).size / 1e6;
  checks.push({ ok: /\.jpe?g$/i.test(img) && mb <= 4, item: 'Ảnh JPEG ≤ 4 MB', detail: `${studio.rel(img)} · ${mb.toFixed(1)} MB` });
  console.log(`\n🖼  Bài ảnh fanpage ${tok.pageName} — ${studio.rel(P.project)}`);
  for (const c of checks) console.log(`   ${c.ok ? '✓' : '✗'} ${c.item}: ${c.detail}`);
  console.log(`\n   Nội dung:\n   ${post.description.replace(/\n/g, '\n   ')}\n   Bình luận đầu:\n   ${post.comment}`);
  if (checks.some((c) => !c.ok)) throw new Error('Có mục ✗ — sửa rồi chạy lại, không đăng');
  if (!yes) { console.log('\n(Xem trước — chưa đăng. Chủ kênh bảo đăng thì thêm --yes.)'); return; }

  const r = await FB.uploadPhoto({ pageId: tok.pageId, token: tok.access_token, file: img, message: post.description });
  const postId = r.post_id || `${tok.pageId}_${r.id}`;
  P.state.photo = { postId, photoId: r.id, url: `https://www.facebook.com/${postId}`, postedAt: new Date().toISOString() };
  P.save();
  try {
    if (post.comment) P.state.photo.commentId = (await FB.comment(postId, tok.access_token, post.comment)).id;
  } catch (e) { console.log(`⚠️  Bình luận link lỗi: ${e.message} (chạy lại --comment-only --yes)`); }
  P.save();
  console.log(`\n✅ Đã đăng bài ảnh: ${P.state.photo.url}${P.state.photo.commentId ? ' + bình luận link' : ''}`);
  console.log('   Nhớ gắn nhãn "nội dung AI" trên web nếu muốn (API không bật được).');
}

main().catch(fail);
