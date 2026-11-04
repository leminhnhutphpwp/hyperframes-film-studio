// ============================================================
//  publish/lib/facebook-project.js — phần chung của publish/facebook/photo.js và video.js
//
//  Một project của kênh có fanpage giữ mọi thứ về Facebook trong <project>/publish/:
//    facebook_post.txt    nội dung bài video; phần sau dòng "---" là bình luận đầu (link YouTube) — chủ kênh duyệt
//    facebook_photo.txt   nội dung bài ảnh (cùng cách viết)
//    facebook_photo.jpg   ảnh của bài ảnh (không có thì dùng thumbnail.jpg)
//    facebook_cover.jpg   ảnh bìa của bài video
//    facebook.json        đã đăng gì: { videoId, url, commentId, postedAt, photo: {...} } — script ghi
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('./studio');
const { writeJson } = require('./cli');

function open(target) {
  const project = studio.projectDir(target);
  const ch = studio.channel({ project });
  const pub = path.join(project, 'publish');
  const stateFile = path.join(pub, 'facebook.json');
  const state = studio.readJson(stateFile, {});
  const yt = studio.readJson(studio.uploadRecord(project, 'vi'), {});
  const meta = studio.readJson(studio.metaFile(project, 'vi'), {});
  return {
    project, ch, pub, state, meta,
    youtubeId: yt.videoId || null,
    save: () => writeJson(stateFile, state),
  };
}

function readPost(file) {
  if (!fs.existsSync(file)) throw new Error(`Chưa có ${studio.rel(file)} — soạn nội dung bài (bình luận link sau dòng ---), cho chủ kênh duyệt`);
  const [desc, cmt] = fs.readFileSync(file, 'utf8').split(/^---\s*$/m);
  return { description: (desc || '').trim(), comment: (cmt || '').trim() };
}

// Trạng thái thật của video trên YouTube (chỉ đọc).
async function youtubeStatus(ch, videoId) {
  if (!videoId) return null;
  try {
    const YouTubeProvider = require('./youtube');
    const yp = new YouTubeProvider(ch);
    await yp.initialize();
    const r = await yp.youtube.videos.list({ part: ['status'], id: [videoId] });
    const it = (r.data.items || [])[0];
    return it ? { privacy: it.status.privacyStatus } : { privacy: 'không tìm thấy' };
  } catch (e) {
    console.log(`⚠️  Không đọc được YouTube: ${e.message}`);
    return null;
  }
}

module.exports = { open, readPost, youtubeStatus };
