#!/usr/bin/env node
// ============================================================
//  publish/youtube/delete.js — XÓA HẲN một video khỏi YouTube (không hoàn tác được)
//
//  Chạy:  node publish/youtube/delete.js <thư-mục-project | videoId --channel=<kênh>> [--lang=en] --yes
//    - KHÔNG có --yes thì chỉ in ra video sẽ bị xóa, không xóa
//    - chỉ xóa video thuộc đúng kênh (token phải khớp channels/<kênh>/channel.js channelId)
//    - xóa xong: bản ghi đăng của project đổi tên thành youtube[.<lang>].deleted-<ngày>.json (để upload lại được,
//      vẫn còn dấu vết) và xóa channels/<kênh>/published/<videoId>.json
//    - tốn 50 đơn vị hạn mức
// ============================================================

'use strict';

const fs = require('fs');
const studio = require('../lib/studio');
const { args, openYouTube, publishedPath, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Dùng: delete.js <thư-mục-project | videoId --channel=<kênh>> [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });

  const yt = await openYouTube(ch);
  const res = await yt.youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const v = (res.data.items || [])[0];
  if (!v) {
    console.log(`Video ${videoId} không còn trên YouTube (có thể đã xóa trước đó).`);
  } else {
    if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} không thuộc kênh ${yt.channel.id} — từ chối xóa.`);
    console.log(`Sẽ xóa: ${videoId} "${v.snippet.title}" (${v.status.privacyStatus})`);
  }
  const rec = publishedPath(ch, videoId);
  const projRec = project && studio.uploadRecord(project, lang);
  console.log(`  bản ghi sẽ dọn: ${[fs.existsSync(rec) && studio.rel(rec), projRec && fs.existsSync(projRec) && studio.rel(projRec)].filter(Boolean).join(', ') || '(không có)'}`);
  if (!yes) { console.log('Chưa xóa gì (thiếu --yes).'); return; }

  if (v) {
    await yt.youtube.videos.delete({ id: videoId });
    console.log(`✅ Đã xóa ${videoId} khỏi YouTube`);
  }
  if (projRec && fs.existsSync(projRec)) {
    const cur = studio.readJson(projRec);
    if (cur && cur.videoId === videoId) {
      const to = projRec.replace(/\.json$/, `.deleted-${new Date().toISOString().slice(0, 10)}.json`);
      fs.renameSync(projRec, to);
      console.log(`   ${studio.rel(projRec)} → ${studio.rel(to)}`);
    }
  }
  if (fs.existsSync(rec)) { fs.unlinkSync(rec); console.log(`   đã xóa ${studio.rel(rec)}`); }
}

main().catch(fail);
