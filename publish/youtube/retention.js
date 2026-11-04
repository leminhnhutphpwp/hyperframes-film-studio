#!/usr/bin/env node
// ============================================================
//  publish/youtube/retention.js — WHERE viewers drop off — READ-ONLY
//
//  YouTube Analytics returns the retention curve as 100 points (each 1% of the video). The script matches those points to the
//  CHAPTERS in the description ("MM:SS Chapter name" lines from youtube-meta[.<lang>].json; without a project it reads the
//  description on YouTube) to show which part of the film was playing when people left.
//
//  audienceWatchRatio          : share of viewers still watching at that point (1.0 = everyone)
//  relativeRetentionPerformance: compared with videos of the SAME LENGTH on YouTube (0.5 = average)
//
//  Run:  node publish/youtube/retention.js <project-folder | videoId --channel=<channel>> [--lang=en] [--days 120] [--drops 8]
// ============================================================

'use strict';

const { google } = require('../lib/google');
const studio = require('../lib/studio');
const { args, openYouTube, fail } = require('../lib/cli');

// "00:25 Opening scene" / "1:02:03 …" -> [{ startSec, text }]
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
  if (!target) throw new Error('Usage: node publish/youtube/retention.js <project-folder | videoId --channel=<channel>> [--lang=en] [--days 120] [--drops 8]');
  const days = a.num('days', 120);
  const nDrops = a.num('drops', 8);
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });

  const yt = await openYouTube(ch);
  const ya = google.youtubeAnalytics({ version: 'v2', auth: yt.oAuth2Client });

  const meta = await yt.youtube.videos.list({ part: ['snippet', 'contentDetails'], id: [videoId] });
  const item = (meta.data.items || [])[0];
  if (!item) throw new Error(`Could not read video ${videoId}`);
  if (item.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} does not belong to channel ${ch.id}.`);
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
  if (!rows.length) { console.log('Not enough retention data for this video yet.'); return; }

  const local = project && studio.readJson(studio.metaFile(project, lang));
  const lines = chaptersOf((local && local.description) || item.snippet.description);

  console.log('RETENTION CURVE (each line is 5% of the video)');
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
  console.log(`\n🔻 The ${nDrops} steepest drops — viewers leave at these points:`);
  for (const d of drops.slice(0, nDrops)) {
    const l = lineAt(lines, d.sec);
    console.log(`  ${String(Math.round(d.sec)).padStart(4)}s  −${(d.drop * 100).toFixed(0)}%  → ${(d.after * 100).toFixed(0)}% left`
      + `  ${l ? l.text.slice(0, 62) : '(before the first chapter)'}`);
  }

  const rel = rows.map((x) => x[2]).filter((x) => x != null);
  if (rel.length) {
    const avg = rel.reduce((s, x) => s + x, 0) / rel.length;
    console.log(`\nCompared with videos of the same length on YouTube: average ${(avg * 100).toFixed(0)}%`
      + ' (50% = average; lower means weaker retention than typical)');
  }
  console.log('\n⚠️  With few views this curve is noisy — look at the trend, not at individual percentages.');
}

main().catch(fail);
