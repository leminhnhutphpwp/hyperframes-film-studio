#!/usr/bin/env node
// ============================================================
//  publish/youtube/set-privacy.js — đổi chế độ hiển thị của video ĐÃ TẢI LÊN (private / unlisted / public)
//
//  Chạy:  node publish/youtube/set-privacy.js <thư-mục-project | videoId --channel=<kênh>> public|unlisted|private [--lang=en] --yes
//    - KHÔNG có --yes thì chỉ in ra việc sẽ làm, không đổi gì (luật: công khai chỉ khi chủ kênh nói rõ cho video đó)
//    - chỉ đụng status.privacyStatus, giữ nguyên các trường khác của status (bản quyền, nhúng, made-for-kids…)
//    - chỉ chạy với token của đúng kênh (channels/<kênh>/channel.js channelId); video phải thuộc kênh
//    - đổi xong ghi lại trạng thái vào <project>/publish/youtube[.<lang>].json và channels/<kênh>/published/<id>.json
//    - tốn ~51 đơn vị hạn mức (videos.list 1 + videos.update 50)
// ============================================================

'use strict';

const studio = require('../lib/studio');
const { args, openYouTube, saveRecords, fail } = require('../lib/cli');

const VALID = ['public', 'unlisted', 'private'];

async function main() {
  const a = args();
  const yes = a.has('yes');
  const [target, privacy] = a.pos;
  if (!target || !VALID.includes(privacy)) throw new Error('Dùng: set-privacy.js <thư-mục-project | videoId> public|unlisted|private [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });

  const yt = await openYouTube(ch);
  const res = await yt.youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const v = (res.data.items || [])[0];
  if (!v) throw new Error(`Không tìm thấy video ${videoId} trên kênh.`);
  if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} không thuộc kênh ${yt.channel.id}.`);
  const cur = v.status.privacyStatus;
  console.log(`Video ${videoId} "${v.snippet.title}": hiện ${cur} -> ${privacy}`);
  if (cur === privacy) { console.log('Không cần đổi.'); return; }
  if (!yes) { console.log('Chưa đổi gì (thiếu --yes).'); return; }

  const s = v.status;
  await yt.youtube.videos.update({
    part: ['status'],
    requestBody: {
      id: videoId,
      status: {
        privacyStatus: privacy,
        embeddable: s.embeddable,
        license: s.license,
        publicStatsViewable: s.publicStatsViewable,
        selfDeclaredMadeForKids: s.selfDeclaredMadeForKids !== undefined ? s.selfDeclaredMadeForKids : !!s.madeForKids,
      },
    },
  });
  saveRecords({ ch, project, lang, videoId, projectPatch: { status: privacy }, channelPatch: { privacy } });
  console.log(`✅ Đã đổi ${videoId} sang ${privacy}`);
}

main().catch(fail);
