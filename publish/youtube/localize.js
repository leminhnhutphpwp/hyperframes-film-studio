#!/usr/bin/env node
// ============================================================
//  publish/youtube/localize.js — TIÊU ĐỀ + MÔ TẢ dịch trên video đã tải lên (mục "Bản dịch" của YouTube)
//
//  Chạy:  node publish/youtube/localize.js <thư-mục-project> [--lang=en] --yes
//    - đọc `localizations` ({ en: { title, description } }) trong publish/youtube-meta[.<lang>].json
//    - giữ nguyên tiêu đề/mô tả/danh mục/tag gốc của video; chỉ thêm hoặc thay các ngôn ngữ được liệt kê
//    - KHÔNG có --yes thì chỉ in ra việc sẽ làm (chủ kênh nói rõ cho video đó mới chạy)
//    - chỉ chạy với token của đúng kênh; video phải thuộc kênh
//    - track tiếng lồng (dub) không có API: Studio → Ngôn ngữ → Lồng tiếng
// ============================================================
'use strict';

const studio = require('../lib/studio');
const { args, openYouTube, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Cách dùng: node publish/youtube/localize.js <thư-mục-project> [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Cần thư mục project (bản dịch lấy từ publish/youtube-meta*.json).');
  const metaFile = studio.metaFile(project, lang);
  const meta = studio.readJson(metaFile);
  if (!meta) throw new Error(`Không có ${studio.rel(metaFile)}.`);
  const loc = meta.localizations || {};
  if (!Object.keys(loc).length) throw new Error(`${studio.rel(metaFile)} chưa có \`localizations\`.`);
  for (const [l, v] of Object.entries(loc)) {
    if (!v.title || !v.description) throw new Error(`localizations.${l} thiếu title hoặc description.`);
    if (v.title.length > 100) throw new Error(`localizations.${l}.title dài ${v.title.length} > 100 ký tự.`);
    if (v.description.length > 5000) throw new Error(`localizations.${l}.description dài ${v.description.length} > 5000 ký tự.`);
  }

  const yt = await openYouTube(ch);
  const api = yt.youtube;
  const cur = ((await api.videos.list({ part: ['snippet', 'localizations'], id: [videoId] })).data.items || [])[0];
  if (!cur) throw new Error(`Không thấy video ${videoId} trên kênh.`);
  if (cur.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} không thuộc kênh ${yt.channel.id}.`);
  const s = cur.snippet;
  const snippet = { title: s.title, description: s.description, categoryId: s.categoryId, tags: s.tags,
    defaultLanguage: s.defaultLanguage || meta.language || lang };
  const have = Object.keys(cur.localizations || {});
  console.log(`Video ${videoId} "${s.title}" (ngôn ngữ gốc ${snippet.defaultLanguage})`);
  console.log(`  đang có bản dịch: ${have.join(', ') || '(không)'}`);
  for (const [l, v] of Object.entries(loc)) console.log(`  ${have.includes(l) ? 'thay' : 'thêm'} ${l}: "${v.title}"`);
  if (!yes) { console.log('Chưa đổi gì (thiếu --yes).'); return; }

  const localizations = { ...(cur.localizations || {}), ...loc };
  await api.videos.update({ part: ['snippet', 'localizations'], requestBody: { id: videoId, snippet, localizations } });
  console.log(`✅ ${videoId}: tiêu đề/mô tả dịch — ${Object.keys(loc).join(', ')} (ngôn ngữ gốc ${snippet.defaultLanguage})`);
}

main().catch(fail);
