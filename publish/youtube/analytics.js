#!/usr/bin/env node
// ============================================================
//  publish/youtube/analytics.js — REAL numbers for your own channel (YouTube Analytics API v2) — READ-ONLY
//
//  Unlike research.js (inferred from other people's channels): this reads your channel's REAL audience — what they type to
//  find your videos, where they stop watching, where views come from.
//
//  Requires "YouTube Analytics API" to be enabled in the OAuth client's Google Cloud project (secrets/google-oauth-client.json).
//  The youtube.readonly scope is enough. The API is free with its own quota, separate from the Data API's 10,000 units/day.
//
//  Run:  node publish/youtube/analytics.js --channel=<channel>            # last 90 days
//        node publish/youtube/analytics.js --channel=<channel> --days 28
//        node publish/youtube/analytics.js --channel=<channel> --days 365 --top 20
// ============================================================

'use strict';

const fs = require('fs');
const { google } = require('../lib/google');
const studio = require('../lib/studio');
const { CREDENTIALS_PATH } = require('../lib/youtube');
const { args, openYouTube } = require('../lib/cli');

const SOURCE_VI = { // display labels for traffic source types
  SUBSCRIBER: 'Subscribers (home / feed)',
  YT_SEARCH: 'YouTube search',
  RELATED_VIDEO: 'Suggested videos',
  NO_LINK_OTHER: 'Direct / unknown source',
  EXT_URL: 'Outside YouTube (Facebook, links…)',
  YT_CHANNEL: 'Channel page',
  YT_OTHER_PAGE: 'Other YouTube pages',
  NOTIFICATION: 'Notifications',
  PLAYLIST: 'Playlists',
  SHORTS: 'Shorts feed',
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

  console.log(`📊 Channel ${ch.config.name} · ${startDate} → ${endDate} (${days} days)\n`);

  const [t] = await q({ metrics: 'views,estimatedMinutesWatched,averageViewPercentage,averageViewDuration,subscribersGained,subscribersLost' });
  if (t) {
    console.log(`TOTAL: ${t[0]} views · ${Math.round(t[1])} minutes watched · avg retention ${t[2].toFixed(1)}%`
      + ` (${Math.round(t[3])}s) · sub +${t[4]} −${t[5]}`);
  }

  console.log('\nWHERE VIEWS COME FROM');
  const src = await q({ metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' });
  const totalSrc = src.reduce((s, r) => s + r[1], 0) || 1;
  for (const r of src) {
    console.log(`  ${pad(r[1], 6)}  ${pad((r[1] / totalSrc * 100).toFixed(0) + '%', 4)}  ${SOURCE_VI[r[0]] || r[0]}`);
  }

  console.log('\nWHAT VIEWERS SEARCH FOR TO FIND YOUR VIDEOS (real search terms)');
  const kw = await q({
    metrics: 'views', dimensions: 'insightTrafficSourceDetail',
    filters: 'insightTrafficSourceType==YT_SEARCH', sort: '-views', maxResults: 25,
  });
  if (!kw.length) console.log('  (none yet — the channel gets few views from search)');
  for (const r of kw) console.log(`  ${pad(r[1], 6)}  ${r[0]}`);

  console.log('\nPER VIDEO (views · % retention — a low % means people open it and leave right away)');
  const vids = await q({ metrics: 'views,averageViewPercentage,estimatedMinutesWatched', dimensions: 'video', sort: '-views', maxResults: top });
  if (vids.length) {
    const meta = await yt.youtube.videos.list({ part: ['snippet'], id: vids.map((r) => r[0]) });
    const name = Object.fromEntries((meta.data.items || []).map((i) => [i.id, i.snippet.title]));
    for (const r of vids) {
      console.log(`  ${pad(r[1], 6)}  ${pad(r[2].toFixed(0) + '%', 4)}  ${(name[r[0]] || r[0]).split('|')[0].trim().slice(0, 56)}`);
    }
  } else console.log('  (no data yet)');
  console.log('\n⚠️  With few views these percentages are noisy — do not change the channel direction because of one video with 3 views.');
}

main().catch((e) => {
  const m = e.message || '';
  if (/has not been used|is disabled/.test(m)) {
    const p = cloudProject();
    console.error(`❌ YouTube Analytics API is not enabled for project ${p || '(Google Cloud project of the OAuth client)'}.`);
    console.error(`   Open: https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com${p ? `?project=${p}` : ''}`);
  } else console.error('❌', m.slice(0, 300));
  process.exit(1);
});
