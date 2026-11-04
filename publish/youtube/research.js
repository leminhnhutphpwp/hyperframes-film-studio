#!/usr/bin/env node
// ============================================================
//  publish/youtube/research.js — finds ideas with the YouTube Data API — READ-ONLY on YouTube
//
//  The "Research" tab in Studio has NO API. What the API does offer, and what this script uses, is:
//    search.list  -> who is rising on this topic (100 units/call)
//    channels.list + playlistItems.list + videos.list -> their whole video library (1 unit/call)
//  then computes VIEWS / DAY and compares it with that channel's own median, to spot episodes that are unusually
//  strong — that is the "this topic works" signal, not which channel is big.
//
//  NO hand-maintained competitor list: channels in the same space are DISCOVERED from seed keywords.
//  Seed keywords: the topic you type (argument or --topic), otherwise the first 4 tags (baseTags) of each
//  legacy niche in channels/<channel>/legacy/niches/ (--niche <id> to use only one niche).
//
//  Run:
//    node publish/youtube/research.js --channel=<channel> "roman history"   (a seed keyword, typed in the search language)
//    node publish/youtube/research.js --channel=<channel> --topic "julius caesar" --region US --relevance en
//    node publish/youtube/research.js --channel=<channel> --niche <niche-id>
//    node publish/youtube/research.js --channel=<channel> --days 180 --channels 10 --seeds 6 --min-dur 90
//  Search region / language: VN / vi by default (the channels are Vietnamese-language); change with --region, --relevance.
//
//  Default API quota is 10,000 units/day. The script prints the units spent.
//  Results are saved to channels/<channel>/research/<date>-<seed>.md + .json (no project is touched).
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const { args, openYouTube, fail } = require('../lib/cli');

let units = 0;
const spend = (n) => { units += n; };

function seedsFromNiches(ch, only) {
  const dir = path.join(ch.dir, 'legacy', 'niches');
  if (!fs.existsSync(dir)) return [];
  const ids = only ? [only] : fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'default.js').map((f) => f.slice(0, -3));
  const out = [];
  for (const id of ids) {
    let n;
    try { n = require(path.join(dir, `${id}.js`)); } catch { continue; }
    // Take the FIRST few tags: they describe the genre; trailing tags are usually overly narrow proper names.
    for (const t of (n.baseTags || []).slice(0, 4)) if (!out.includes(t)) out.push(t);
  }
  return out;
}

// "PT3M21S" -> 201
function iso8601Sec(d) {
  const m = String(d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
}

const daysSince = (iso) => Math.max(1, (Date.now() - new Date(iso).getTime()) / 864e5);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// --- step 1: seed keywords -> which channels own the space (auto-discovered) ---
async function discoverChannels(yt, seeds, { days, perSeed, minDurSec, region, relevance, ownChannel }) {
  const publishedAfter = new Date(Date.now() - days * 864e5).toISOString();
  const hits = new Map();   // channelId -> { title, seeds:Set, videoIds:Set }
  for (const q of seeds) {
    const r = await yt.youtube.search.list({
      part: ['snippet'], q, type: ['video'], order: 'viewCount', publishedAfter,
      regionCode: region, relevanceLanguage: relevance, maxResults: perSeed,
    });
    spend(100);
    for (const it of r.data.items || []) {
      const cid = it.snippet.channelId;
      if (cid === ownChannel) continue;
      if (!hits.has(cid)) hits.set(cid, { channelId: cid, title: it.snippet.channelTitle, seeds: new Set(), videoIds: new Set() });
      const h = hits.get(cid);
      h.seeds.add(q);
      h.videoIds.add(it.id.videoId);
    }
    process.stdout.write(`   seed "${q}" → ${r.data.items.length} videos\n`);
  }

  // Filter out SHORTS channels. Broad keywords also pull in 20-second skit channels,
  // which otherwise reach the top of the list. Our channels make 2–4 minute stories,
  // so keep only channels whose MATCHING videos are mostly longer than the threshold.
  const all = [...hits.values()];
  const ids = [...new Set(all.flatMap((h) => [...h.videoIds]))];
  const dur = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt.youtube.videos.list({ part: ['contentDetails'], id: ids.slice(i, i + 50) });
    spend(1);
    for (const it of v.data.items || []) dur.set(it.id, iso8601Sec(it.contentDetails.duration));
  }
  for (const h of all) {
    const ds = [...h.videoIds].map((id) => dur.get(id)).filter((x) => x > 0);
    h.medianDurSec = median(ds);
  }
  const kept = all.filter((h) => h.medianDurSec >= minDurSec);
  const dropped = all.length - kept.length;
  if (dropped) process.stdout.write(`   (dropped ${dropped} channels whose matching videos are shorter than ${minDurSec}s — mostly Shorts channels)\n`);

  // A channel that shows up for several different keywords is really in the space, not a coincidence.
  return kept.sort((a, b) => (b.seeds.size - a.seeds.size) || (b.videoIds.size - a.videoIds.size));
}

// --- step 2: scan one channel's library, compute views/day ---
async function scanChannel(yt, channelId, { maxVideos }) {
  const ch = await yt.youtube.channels.list({ part: ['snippet', 'contentDetails', 'statistics'], id: [channelId] });
  spend(1);
  const c = (ch.data.items || [])[0];
  if (!c) return null;
  const uploads = c.contentDetails.relatedPlaylists.uploads;

  const ids = [];
  let pageToken;
  while (ids.length < maxVideos) {
    const pl = await yt.youtube.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    spend(1);
    for (const it of pl.data.items || []) ids.push(it.contentDetails.videoId);
    pageToken = pl.data.nextPageToken;
    if (!pageToken) break;
  }

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt.youtube.videos.list({ part: ['snippet', 'statistics', 'contentDetails'], id: ids.slice(i, i + 50) });
    spend(1);
    for (const it of v.data.items || []) {
      const views = Number(it.statistics.viewCount || 0);
      const age = daysSince(it.snippet.publishedAt);
      videos.push({
        videoId: it.id, title: it.snippet.title, publishedAt: it.snippet.publishedAt,
        ageDays: Math.round(age), views, viewsPerDay: views / age,
        duration: it.contentDetails.duration,
      });
    }
  }
  const med = median(videos.map((v) => v.viewsPerDay));
  for (const v of videos) v.ratio = med ? v.viewsPerDay / med : 0;   // how many times above THAT channel's own median
  return {
    channelId, title: c.snippet.title,
    subs: Number(c.statistics.subscriberCount || 0),
    videoCount: Number(c.statistics.videoCount || 0),
    scanned: videos.length, medianViewsPerDay: med, videos,
  };
}

// --- step 3: frequent words in the titles of STANDOUT episodes (STOP: English + Vietnamese stop words, data) ---
const STOP = new Set(('the and of to a in is it you that for on with as this was are be at by from or an my your how why what when who '
  + 'story stories part full hd new best episode ep video official animated animation explained '
  + 'tập chuyện truyện của và với là có cho một các những người thì mà ở đi về ra vào nghe kể phần '
  + 'mới hay nhất nhé nha p vietnam việt nam shorts short').split(/\s+/));
function titleWords(videos) {
  const freq = new Map();
  for (const v of videos) {
    const seen = new Set();
    for (const w of v.title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
      if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]);
}

function buildReport({ seeds, days, channels, outliers, words, ch, region, relevance }) {
  const L = [];
  L.push(`# Idea research — ${ch.config.name} — ${new Date().toISOString().slice(0, 10)}`);
  L.push('');
  L.push(`Seed keywords: ${seeds.map((s) => `\`${s}\``).join(', ')} · discovery window: ${days} days · region ${region}/${relevance} · ${units} API units`);
  L.push('');
  L.push('## Channels in the same space (found by the API, not a preset list)');
  L.push('| Channel | Subs | Videos | Scanned | Median views/day |');
  L.push('|---|--:|--:|--:|--:|');
  for (const c of channels) {
    L.push(`| ${c.title} | ${c.subs.toLocaleString('vi-VN')} | ${c.videoCount} | ${c.scanned} | ${Math.round(c.medianViewsPerDay)} |`);
  }
  L.push('');
  L.push('## Episodes that outperform their own channel (≥1.8× median)');
  L.push('This is a TOPIC signal, with channel size already factored out.');
  L.push('');
  L.push('| × median | Views/day | Age | Channel | Title |');
  L.push('|--:|--:|--:|---|---|');
  for (const v of outliers) {
    L.push(`| ${v.ratio.toFixed(1)}× | ${Math.round(v.viewsPerDay).toLocaleString('vi-VN')} | ${v.ageDays}d | ${v.channelTitle} | ${v.title.replace(/\|/g, '/')} |`);
  }
  L.push('');
  L.push('## Frequent words in the titles of standout episodes');
  L.push(words.slice(0, 30).map(([w, n]) => `${w} (${n})`).join(' · '));
  L.push('');
  return L.join('\n');
}

async function main() {
  const a = args();
  const ch = studio.channel();
  const days = a.num('days', 120);
  const maxChannels = a.num('channels', 8);
  const perSeed = a.num('seeds', 25);
  const maxVideos = a.num('videos', 150);
  const minDurSec = a.num('min-dur', 90);
  const region = a.flags.region || process.env.RESEARCH_REGION || 'VN';
  const relevance = a.flags.relevance || 'vi';
  const typed = [...a.pos, ...(typeof a.flags.topic === 'string' ? [a.flags.topic] : [])];
  const seeds = typed.length ? typed : seedsFromNiches(ch, a.flags.niche || null);
  if (!seeds.length) throw new Error('No seed keywords — pass a topic ("…" or --topic) or --niche <id>');

  const yt = await openYouTube(ch);
  const ownChannel = ch.config.channelId;

  console.log(`🔎 ${ch.config.name}: ${seeds.length} seed keywords, ${days}-day window, region ${region}/${relevance} (each seed costs 100 units)`);
  const found = await discoverChannels(yt, seeds, { days, perSeed, minDurSec, region, relevance, ownChannel });
  console.log(`\n📡 Discovered ${found.length} channels in the same space — scanning the ${Math.min(maxChannels, found.length)} with the strongest signal\n`);

  const channels = [];
  for (const f of found.slice(0, maxChannels)) {
    const c = await scanChannel(yt, f.channelId, { maxVideos });
    if (!c) continue;
    channels.push(c);
    console.log(`   ${c.title.padEnd(28).slice(0, 28)} ${String(c.subs).padStart(8)} subs · scanned ${c.scanned} videos · median ${Math.round(c.medianViewsPerDay)} views/day`);
  }

  const outliers = channels.flatMap((c) => c.videos.map((v) => ({ ...v, channelTitle: c.title })))
    .filter((v) => v.ratio >= 1.8 && v.ageDays >= 3)
    .sort((x, y) => y.ratio - x.ratio)
    .slice(0, 40);
  const words = titleWords(outliers);

  const outDir = path.join(ch.dir, 'research');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = `${new Date().toISOString().slice(0, 10)}-${(seeds[0] || 'tong-hop').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const md = path.join(outDir, `${stamp}.md`);
  const json = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(md, buildReport({ seeds, days, channels, outliers, words, ch, region, relevance }), 'utf8');
  fs.writeFileSync(json, JSON.stringify({ channel: ch.id, seeds, days, region, relevance, units, channels, outliers }, null, 2), 'utf8');

  console.log(`\n🏆 ${outliers.length} standout episodes (≥1.8× their own channel's median):`);
  for (const v of outliers.slice(0, 12)) {
    console.log(`   ${v.ratio.toFixed(1)}×  ${String(Math.round(v.viewsPerDay)).padStart(6)} views/day  ${v.channelTitle.slice(0, 18).padEnd(18)}  ${v.title.slice(0, 62)}`);
  }
  console.log(`\n📄 ${studio.rel(md)}`);
  console.log(`💰 Spent ${units} / 10,000 units of the daily quota`);
}

main().catch(fail);
