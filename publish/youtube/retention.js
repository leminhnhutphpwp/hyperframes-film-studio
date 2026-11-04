#!/usr/bin/env node
// ============================================================
//  publish/youtube/retention.js — người xem bỏ đi ở ĐOẠN NÀO — CHỈ ĐỌC
//
//  YouTube Analytics trả đường giữ chân theo 100 mốc (mỗi mốc 1% video). Script ghép mốc đó với các
//  CHƯƠNG trong mô tả (dòng "MM:SS Tên chương" của youtube-meta[.<lang>].json; không có project thì đọc
//  mô tả trên YouTube) để biết lúc người ta rời đi thì phim đang ở đoạn nào.
//
//  audienceWatchRatio          : tỉ lệ người còn xem ở mốc đó (1.0 = còn nguyên)
//  relativeRetentionPerformance: so với video CÙNG ĐỘ DÀI trên YouTube (0.5 = bằng trung bình)
//
//  Chạy:  node publish/youtube/retention.js <thư-mục-project | videoId --channel=<kênh>> [--lang=en] [--days 120] [--drops 8]
// ============================================================

'use strict';

const { google } = require('../lib/google');
const studio = require('../lib/studio');
const { args, openYouTube, fail } = require('../lib/cli');

// "00:25 Một nền cộng hòa" / "1:02:03 …" -> [{ startSec, text }]
function chaptersOf(description) {
  const out = [];
  for (const line of String(description || '').split('\n')) {
    const m = line.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+)$/);
    if (m) out.push({ startSec: (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]), text: m[4].trim() });
  }
  return out.sort((x, y) => x.startSec - y.startSec);
}

function lineAt(lines, sec) {
  let cur = null;
  for (const l of lines) { if (l.startSec <= sec) cur = l; else break; }
  return cur;
}

const bar = (r) => '█'.repeat(Math.max(0, Math.min(24, Math.round(r * 24)))).padEnd(24, '·');

async function main() {
  const a = args();
  const target = a.pos[0];
  if (!target) throw new Error('Cách dùng: node publish/youtube/retention.js <thư-mục-project | videoId --channel=<kênh>> [--lang=en] [--days 120] [--drops 8]');
  const days = a.num('days', 120);
  const nDrops = a.num('drops', 8);
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });

  const yt = await openYouTube(ch);
  const ya = google.youtubeAnalytics({ version: 'v2', auth: yt.oAuth2Client });

  const meta = await yt.youtube.videos.list({ part: ['snippet', 'contentDetails'], id: [videoId] });
  const item = (meta.data.items || [])[0];
  if (!item) throw new Error(`Không đọc được video ${videoId}`);
  if (item.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} không thuộc kênh ${ch.id}.`);
  const m = item.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durSec = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const r = await ya.reports.query({
    ids: 'channel==MINE', startDate, endDate,
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${videoId};audienceType==ORGANIC`, sort: 'elapsedVideoTimeRatio',
  });
  const rows = r.data.rows || [];
  console.log(`📉 ${item.snippet.title.split('|')[0].trim()}`);
  console.log(`   ${videoId} · ${Math.round(durSec)}s · ${startDate} → ${endDate}\n`);
  if (!rows.length) { console.log('Chưa đủ dữ liệu giữ chân cho video này.'); return; }

  const local = project && studio.readJson(studio.metaFile(project, lang));
  const lines = chaptersOf((local && local.description) || item.snippet.description);

  console.log('ĐƯỜNG GIỮ CHÂN (mỗi dòng 5% video)');
  for (let i = 0; i < rows.length; i += 5) {
    const [ratio, watch, rel] = rows[i];
    const sec = ratio * durSec;
    const l = lineAt(lines, sec);
    console.log(`  ${String(Math.round(sec)).padStart(4)}s ${bar(watch)} ${(watch * 100).toFixed(0).padStart(3)}%`
      + `  ${rel != null ? 'vs YT ' + (rel * 100).toFixed(0).padStart(2) + '%' : ''}  ${l ? l.text.slice(0, 44) : ''}`);
  }

  const drops = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i - 1][1] - rows[i][1];
    if (d > 0) drops.push({ sec: rows[i][0] * durSec, drop: d, after: rows[i][1] });
  }
  drops.sort((x, y) => y.drop - x.drop);
  console.log(`\n🔻 ${nDrops} chỗ tụt mạnh nhất — người xem rời đi ở đoạn này:`);
  for (const d of drops.slice(0, nDrops)) {
    const l = lineAt(lines, d.sec);
    console.log(`  ${String(Math.round(d.sec)).padStart(4)}s  −${(d.drop * 100).toFixed(0)}%  → còn ${(d.after * 100).toFixed(0)}%`
      + `  ${l ? l.text.slice(0, 62) : '(trước chương đầu)'}`);
  }

  const rel = rows.map((x) => x[2]).filter((x) => x != null);
  if (rel.length) {
    const avg = rel.reduce((s, x) => s + x, 0) / rel.length;
    console.log(`\nSo với video cùng độ dài trên YouTube: trung bình ${(avg * 100).toFixed(0)}%`
      + ' (50% = ngang mức trung bình; thấp hơn nghĩa là giữ chân kém hơn mặt bằng)');
  }
  console.log('\n⚠️  Ít view thì đường này nhiễu — coi xu hướng, đừng bám từng phần trăm.');
}

main().catch(fail);
