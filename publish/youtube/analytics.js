#!/usr/bin/env node
// ============================================================
//  publish/youtube/analytics.js — số liệu THẬT của kênh mình (YouTube Analytics API v2) — CHỈ ĐỌC
//
//  Khác research.js (đoán từ kênh người khác): cái này đọc khán giả THẬT của kênh — họ gõ gì để
//  ra video mình, xem tới đâu thì bỏ, view tới từ đâu.
//
//  Cần bật "YouTube Analytics API" trong Google Cloud project của OAuth client (secrets/google-oauth-client.json).
//  Scope youtube.readonly là đủ. API miễn phí, hạn mức riêng, không ăn vào 10.000 unit/ngày của Data API.
//
//  Chạy:  node publish/youtube/analytics.js --channel=<kênh>            # 90 ngày gần nhất
//         node publish/youtube/analytics.js --channel=<kênh> --days 28
//         node publish/youtube/analytics.js --channel=<kênh> --days 365 --top 20
// ============================================================

'use strict';

const fs = require('fs');
const { google } = require('../lib/google');
const studio = require('../lib/studio');
const { CREDENTIALS_PATH } = require('../lib/youtube');
const { args, openYouTube } = require('../lib/cli');

const SOURCE_VI = {
  SUBSCRIBER: 'Người đăng ký (trang chủ / feed)',
  YT_SEARCH: 'Tìm kiếm trên YouTube',
  RELATED_VIDEO: 'Video đề xuất bên cạnh',
  NO_LINK_OTHER: 'Trực tiếp / không rõ nguồn',
  EXT_URL: 'Ngoài YouTube (Facebook, link…)',
  YT_CHANNEL: 'Trang kênh',
  YT_OTHER_PAGE: 'Trang khác của YouTube',
  NOTIFICATION: 'Thông báo',
  PLAYLIST: 'Danh sách phát',
  SHORTS: 'Bảng tin Shorts',
};

const pad = (x, n) => String(x).padStart(n);

function cloudProject() {
  try {
    const c = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    return (c.installed || c.web || {}).project_id || null;
  } catch { return null; }
}

async function main() {
  const a = args();
  const days = a.num('days', 90);
  const top = a.num('top', 12);
  const ch = studio.channel();

  const yt = await openYouTube(ch);
  const ya = google.youtubeAnalytics({ version: 'v2', auth: yt.oAuth2Client });

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const q = (o) => ya.reports.query({ ids: 'channel==MINE', startDate, endDate, ...o })
    .then((r) => r.data.rows || []);

  console.log(`📊 Kênh ${ch.config.name} · ${startDate} → ${endDate} (${days} ngày)\n`);

  const [t] = await q({ metrics: 'views,estimatedMinutesWatched,averageViewPercentage,averageViewDuration,subscribersGained,subscribersLost' });
  if (t) {
    console.log(`TỔNG: ${t[0]} view · ${Math.round(t[1])} phút xem · giữ chân TB ${t[2].toFixed(1)}%`
      + ` (${Math.round(t[3])}s) · sub +${t[4]} −${t[5]}`);
  }

  console.log('\nVIEW TỚI TỪ ĐÂU');
  const src = await q({ metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' });
  const totalSrc = src.reduce((s, r) => s + r[1], 0) || 1;
  for (const r of src) {
    console.log(`  ${pad(r[1], 6)}  ${pad((r[1] / totalSrc * 100).toFixed(0) + '%', 4)}  ${SOURCE_VI[r[0]] || r[0]}`);
  }

  console.log('\nNGƯỜI XEM GÕ GÌ ĐỂ RA VIDEO MÌNH (cụm tìm kiếm thật)');
  const kw = await q({
    metrics: 'views', dimensions: 'insightTrafficSourceDetail',
    filters: 'insightTrafficSourceType==YT_SEARCH', sort: '-views', maxResults: 25,
  });
  if (!kw.length) console.log('  (chưa có — kênh còn ít lượt vào từ tìm kiếm)');
  for (const r of kw) console.log(`  ${pad(r[1], 6)}  ${r[0]}`);

  console.log('\nTỪNG VIDEO (view · % giữ chân — % thấp là mở ra rồi bỏ đi liền)');
  const vids = await q({ metrics: 'views,averageViewPercentage,estimatedMinutesWatched', dimensions: 'video', sort: '-views', maxResults: top });
  if (vids.length) {
    const meta = await yt.youtube.videos.list({ part: ['snippet'], id: vids.map((r) => r[0]) });
    const name = Object.fromEntries((meta.data.items || []).map((i) => [i.id, i.snippet.title]));
    for (const r of vids) {
      console.log(`  ${pad(r[1], 6)}  ${pad(r[2].toFixed(0) + '%', 4)}  ${(name[r[0]] || r[0]).split('|')[0].trim().slice(0, 56)}`);
    }
  } else console.log('  (chưa có số liệu)');
  console.log('\n⚠️  Ít view thì mấy con số % này nhiễu — đừng đổi hướng kênh vì một video 3 view.');
}

main().catch((e) => {
  const m = e.message || '';
  if (/has not been used|is disabled/.test(m)) {
    const p = cloudProject();
    console.error(`❌ Chưa bật YouTube Analytics API cho project ${p || '(Google Cloud của OAuth client)'}.`);
    console.error(`   Mở: https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com${p ? `?project=${p}` : ''}`);
  } else console.error('❌', m.slice(0, 300));
  process.exit(1);
});
