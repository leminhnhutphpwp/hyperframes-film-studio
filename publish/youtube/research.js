#!/usr/bin/env node
// ============================================================
//  publish/youtube/research.js — tìm ý tưởng bằng YouTube Data API — CHỈ ĐỌC YouTube
//
//  Tab "Nghiên cứu" trong Studio KHÔNG có API. Cái API cho được, và script này dùng, là:
//    search.list  -> ai đang lên với chủ đề này (100 unit/lần gọi)
//    channels.list + playlistItems.list + videos.list -> nguyên kho video của họ (1 unit/lần)
//  rồi tính LƯỢT XEM / NGÀY và so với mức trung vị của chính kênh đó, để thấy tập nào vượt trội bất
//  thường — đó mới là tín hiệu "đề tài này ăn", không phải kênh nào to.
//
//  KHÔNG khai báo danh sách đối thủ: kênh cùng sân được TỰ PHÁT HIỆN từ từ khóa gieo.
//  Từ khóa gieo: chủ đề gõ vào (đối số hoặc --topic), không có thì lấy 4 tag đầu (baseTags) của mỗi
//  niche cũ trong channels/<kênh>/legacy/niches/ (--niche <id> để chỉ lấy một niche).
//
//  Chạy:
//    node publish/youtube/research.js --channel=<kênh> "truyện cười bác ba phi"
//    node publish/youtube/research.js --channel=<kênh> --topic "julius caesar" --region US --relevance en
//    node publish/youtube/research.js --channel=<kênh> --niche co-tich
//    node publish/youtube/research.js --channel=<kênh> --days 180 --channels 10 --seeds 6 --min-dur 90
//  Vùng / ngôn ngữ tìm: mặc định VN / vi (cả hai kênh nói tiếng Việt); --region, --relevance để đổi.
//
//  Hạn mức API mặc định 10.000 unit/ngày. Script in ra số unit đã tiêu.
//  Kết quả lưu channels/<kênh>/research/<ngày>-<mồi>.md + .json (không đụng vào project nào).
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
    // Lấy mấy tag ĐẦU: chúng là mô tả thể loại, tag đuôi thường là tên riêng quá hẹp.
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

// --- bước 1: gieo từ khóa -> kênh nào đang chiếm sân (tự phát hiện) ---
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
    process.stdout.write(`   gieo "${q}" → ${r.data.items.length} video\n`);
  }

  // Lọc kênh SHORTS ra. Từ khóa rộng như "truyện vui" kéo về cả kênh skit 20 giây
  // (đo 23/09/2026: Nam Đồng, Ba Em Bé Lai lọt vào top vì vậy). Kênh mình làm truyện
  // dài 2–4 phút, nên chỉ giữ kênh mà video KHỚP của họ phần lớn dài hơn ngưỡng.
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
  if (dropped) process.stdout.write(`   (bỏ ${dropped} kênh có video khớp ngắn hơn ${minDurSec}s — phần lớn là kênh Shorts)\n`);

  // Kênh xuất hiện với nhiều từ khóa khác nhau = đúng sân, không phải trùng hợp.
  return kept.sort((a, b) => (b.seeds.size - a.seeds.size) || (b.videoIds.size - a.videoIds.size));
}

// --- bước 2: quét kho của một kênh, tính lượt xem/ngày ---
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
  for (const v of videos) v.ratio = med ? v.viewsPerDay / med : 0;   // vượt trung vị của CHÍNH kênh đó bao nhiêu lần
  return {
    channelId, title: c.snippet.title,
    subs: Number(c.statistics.subscriberCount || 0),
    videoCount: Number(c.statistics.videoCount || 0),
    scanned: videos.length, medianViewsPerDay: med, videos,
  };
}

// --- bước 3: chữ nào hay xuất hiện trong tiêu đề của các tập VƯỢT TRỘI ---
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
  L.push(`# Tìm ý tưởng — ${ch.config.name} — ${new Date().toISOString().slice(0, 10)}`);
  L.push('');
  L.push(`Từ khóa gieo: ${seeds.map((s) => `\`${s}\``).join(', ')} · cửa sổ phát hiện: ${days} ngày · vùng ${region}/${relevance} · ${units} unit API`);
  L.push('');
  L.push('## Kênh cùng sân (API tự tìm ra, không khai báo sẵn)');
  L.push('| Kênh | Subs | Video | Đã quét | Trung vị xem/ngày |');
  L.push('|---|--:|--:|--:|--:|');
  for (const c of channels) {
    L.push(`| ${c.title} | ${c.subs.toLocaleString('vi-VN')} | ${c.videoCount} | ${c.scanned} | ${Math.round(c.medianViewsPerDay)} |`);
  }
  L.push('');
  L.push('## Tập vượt trội so với chính kênh đó (≥1,8 lần trung vị)');
  L.push('Đây là tín hiệu ĐỀ TÀI, đã trừ đi chuyện kênh to hay kênh nhỏ.');
  L.push('');
  L.push('| x trung vị | Xem/ngày | Tuổi | Kênh | Tiêu đề |');
  L.push('|--:|--:|--:|---|---|');
  for (const v of outliers) {
    L.push(`| ${v.ratio.toFixed(1)}× | ${Math.round(v.viewsPerDay).toLocaleString('vi-VN')} | ${v.ageDays}n | ${v.channelTitle} | ${v.title.replace(/\|/g, '/')} |`);
  }
  L.push('');
  L.push('## Chữ hay gặp trong tiêu đề của các tập vượt trội');
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
  if (!seeds.length) throw new Error('Không có từ khóa gieo — truyền chủ đề ("…" hoặc --topic) hoặc --niche <id>');

  const yt = await openYouTube(ch);
  const ownChannel = ch.config.channelId;

  console.log(`🔎 ${ch.config.name}: gieo ${seeds.length} từ khóa, cửa sổ ${days} ngày, vùng ${region}/${relevance} (mỗi lần gieo tốn 100 unit)`);
  const found = await discoverChannels(yt, seeds, { days, perSeed, minDurSec, region, relevance, ownChannel });
  console.log(`\n📡 Tự phát hiện ${found.length} kênh cùng sân — quét ${Math.min(maxChannels, found.length)} kênh nhiều tín hiệu nhất\n`);

  const channels = [];
  for (const f of found.slice(0, maxChannels)) {
    const c = await scanChannel(yt, f.channelId, { maxVideos });
    if (!c) continue;
    channels.push(c);
    console.log(`   ${c.title.padEnd(28).slice(0, 28)} ${String(c.subs).padStart(8)} subs · quét ${c.scanned} video · trung vị ${Math.round(c.medianViewsPerDay)} xem/ngày`);
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

  console.log(`\n🏆 ${outliers.length} tập vượt trội (≥1,8× trung vị kênh của chính nó):`);
  for (const v of outliers.slice(0, 12)) {
    console.log(`   ${v.ratio.toFixed(1)}×  ${String(Math.round(v.viewsPerDay)).padStart(6)} xem/ngày  ${v.channelTitle.slice(0, 18).padEnd(18)}  ${v.title.slice(0, 62)}`);
  }
  console.log(`\n📄 ${studio.rel(md)}`);
  console.log(`💰 Đã tiêu ${units} / 10.000 unit hạn mức ngày`);
}

main().catch(fail);
