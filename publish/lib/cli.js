// ============================================================
//  publish/lib/cli.js — phần chung của các lệnh trong publish/youtube/ và publish/facebook/
//
//  args()            cờ (--yes, --lang=en, --days 90…) + đối số vị trí, không lẫn giá trị của cờ vào vị trí
//  openYouTube(ch)   đăng nhập bằng token của kênh + chặn token của kênh khác (assertExpectedChannel)
//  saveRecords()     cập nhật bản ghi đăng của project và channels/<kênh>/published/<videoId>.json
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('./studio');

// Cờ nhận giá trị ở đối số kế tiếp (dạng "--days 90"); dạng "--x=y" thì luôn được.
const VALUE_FLAGS = new Set(['channel', 'lang', 'langs', 'days', 'top', 'drops', 'channels', 'seeds', 'videos', 'niche',
  'min-dur', 'region', 'relevance', 'topic', 'privacy', 'video', 'cover', 'source', 'at', 'reply', 'file']);

function args(argv = process.argv.slice(2)) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const [k, ...v] = a.slice(2).split('=');
    if (v.length) flags[k] = v.join('=');
    else if (VALUE_FLAGS.has(k) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
    else flags[k] = true;
  }
  return { flags, pos, has: (k) => !!flags[k], num: (k, d) => (flags[k] !== undefined ? Number(flags[k]) : d) };
}

async function openYouTube(ch) {
  const YouTubeProvider = require('./youtube');
  const yt = new YouTubeProvider(ch);
  await yt.initialize();
  yt.assertExpectedChannel();
  return yt;
}

function isScopeError(e) {
  const msg = String((e && e.message) || '');
  const reason = e && e.errors && e.errors[0] && e.errors[0].reason;
  return /insufficient.*scope/i.test(msg) || reason === 'insufficientPermissions'
    || (e && e.code === 403 && /insufficient/i.test(msg));
}

const publishedPath = (ch, videoId) => path.join(ch.published, `${videoId}.json`);

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}

// Sửa vài trường của bản ghi đăng (project + kênh) sau khi đổi thứ gì trên YouTube.
//   project: patch cho <project>/publish/youtube[.<lang>].json (vd { status: 'public' })
//   channel: patch cho channels/<kênh>/published/<videoId>.json (vd { privacy: 'public' })
function saveRecords({ ch, project, lang = 'vi', videoId, projectPatch = null, channelPatch = null }) {
  if (project && projectPatch) {
    const f = studio.uploadRecord(project, lang);
    const cur = studio.readJson(f);
    if (cur && cur.videoId === videoId) writeJson(f, { ...cur, ...projectPatch });
  }
  if (channelPatch) {
    const f = publishedPath(ch, videoId);
    const cur = studio.readJson(f);
    if (cur) writeJson(f, { ...cur, ...channelPatch });
  }
}

function fail(e) {
  console.error('❌', String((e && e.message) || e).slice(0, 400));
  process.exit(1);
}

module.exports = { args, openYouTube, isScopeError, publishedPath, writeJson, saveRecords, fail };
