// ============================================================
//  publish/lib/studio.js — đường dẫn của studio + chọn kênh cho mọi lệnh đăng / số liệu
//
//  Kênh lấy theo thứ tự: thư mục project (projects/<kênh>/<phim>) → --channel=<kênh> → STUDIO_CHANNEL.
//  Không đoán: thiếu kênh là dừng, để không bao giờ đăng nhầm kênh.
//
//  channels/<kênh>/channel.js   bản sắc (channelId, tên, tag, ngôn ngữ…) — lên git
//  channels/<kênh>/published/   hồ sơ video đã đăng (<videoId>.json) — lên git
//  secrets/google-oauth-client.json            OAuth client Google Cloud (chung) — git bỏ qua
//  secrets/<kênh>/youtube-token.json           token YouTube của đúng kênh — git bỏ qua
//  secrets/<kênh>/facebook-token.json          token trang Facebook (nếu kênh có fanpage)
//  .env (gốc studio)                           khoá API (FB_APP_ID, XAH_…) — git bỏ qua
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const CHANNELS_DIR = path.join(ROOT, 'channels');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const SECRETS_DIR = path.join(ROOT, 'secrets');
// Video đã dựng được dời khỏi <project>/out/ sang kho lưu trữ, cùng đường dẫn tương đối với projects/
// (xem <phim>/archived.json). Đổi kho: STUDIO_ARCHIVE=/đường/dẫn.
const ARCHIVE_DIR = process.env.STUDIO_ARCHIVE || path.join(ROOT, 'archive');

function listChannels() {
  return fs.readdirSync(CHANNELS_DIR).filter((d) => fs.existsSync(path.join(CHANNELS_DIR, d, 'channel.js')));
}

// projects/<kênh>/<phim>[/<phần>] → <kênh>; ngoài projects/ → null
function channelOfProject(dir) {
  const rel = path.relative(PROJECTS_DIR, path.resolve(dir));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep)[0];
}

function argValue(argv, name) {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return null;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
}

// Kênh của lệnh này: { id, dir, config, secrets, published }
function channel({ project, argv = process.argv } = {}) {
  const fromProject = project ? channelOfProject(project) : null;
  const fromArg = argValue(argv, 'channel');
  if (fromProject && fromArg && fromProject !== fromArg) {
    throw new Error(`Project thuộc kênh "${fromProject}" nhưng --channel=${fromArg} — dừng.`);
  }
  let id = fromProject || fromArg || process.env.STUDIO_CHANNEL;
  // a project's other-language cut can belong to a sister channel: channel.js languageChannels { en: '<kênh>' }
  // Applies to project commands run with --lang=<x>.
  const lang = argValue(argv, 'lang');
  if (fromProject && lang && listChannels().includes(id)) {
    const cfg = require(path.join(CHANNELS_DIR, id, 'channel.js'));
    if (cfg.languageChannels && cfg.languageChannels[lang]) id = cfg.languageChannels[lang];
  }
  const known = listChannels();
  if (!id) throw new Error(`Chưa chọn kênh: thêm --channel=<${known.join('|')}> (hoặc chạy với thư mục project).`);
  if (!known.includes(id)) throw new Error(`Không có kênh "${id}" trong channels/ (có: ${known.join(', ')}).`);
  const dir = path.join(CHANNELS_DIR, id);
  return {
    id,
    dir,
    config: require(path.join(dir, 'channel.js')),
    secrets: path.join(SECRETS_DIR, id),
    published: path.join(dir, 'published'),
  };
}

// Thư mục project từ đối số (tương đối với cwd hoặc gốc studio).
function projectDir(arg) {
  for (const p of [path.resolve(arg), path.join(ROOT, arg)]) if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  throw new Error(`Không thấy thư mục project: ${arg}`);
}

// Bản ghi đăng của project: <project>/publish/youtube[.<lang>].json (videoId, url, status)
function uploadRecord(dir, lang = 'vi') {
  return path.join(dir, 'publish', lang === 'vi' ? 'youtube.json' : `youtube.${lang}.json`);
}

// videoId từ đối số: một videoId (11 ký tự) hoặc thư mục project đã đăng.
function resolveVideo(arg, { lang = 'vi', argv = process.argv } = {}) {
  if (/^[A-Za-z0-9_-]{11}$/.test(arg) && !fs.existsSync(arg)) {
    return { videoId: arg, project: null, channel: channel({ argv }) };
  }
  const dir = projectDir(arg);
  const rec = uploadRecord(dir, lang);
  if (!fs.existsSync(rec)) throw new Error(`Project chưa đăng (không có ${path.relative(ROOT, rec)}).`);
  const { videoId } = JSON.parse(fs.readFileSync(rec, 'utf8'));
  return { videoId, project: dir, channel: channel({ project: dir, argv }) };
}

function rel(p) {
  return path.relative(ROOT, p);
}

// Bản sao trong kho lưu trữ của một file trong projects/ (null nếu file không nằm trong projects/).
function archiveMirror(p) {
  const r = path.relative(PROJECTS_DIR, path.resolve(p));
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
  return path.join(ARCHIVE_DIR, r);
}

// File của project: chỗ cũ nếu còn, không thì bản trong kho lưu trữ; không có cả hai → null.
function findMedia(p) {
  if (fs.existsSync(p)) return p;
  const m = archiveMirror(p);
  return m && fs.existsSync(m) ? m : null;
}

// File video của project cho ngôn ngữ lang: <tên>.mp4 (vi) hoặc <tên>.<lang>.mp4, trong out/ hoặc kho lưu trữ.
function findProjectVideo(project, lang) {
  const out = path.join(project, 'out');
  const dirs = [out, archiveMirror(out)].filter((d) => d && fs.existsSync(d));
  const want = (f) => f.endsWith('.mp4') && (lang === 'vi' ? !/\.[a-z]{2}\.mp4$/.test(f) : f.endsWith(`.${lang}.mp4`));
  for (const d of dirs) {
    const hits = fs.readdirSync(d).filter(want).filter((f) => !/preview|draft|test/i.test(f));
    if (hits.length === 1) return path.join(d, hits[0]);
    if (hits.length > 1) throw new Error(`Có ${hits.length} video trong ${d} (${hits.join(', ')}) — chọn bằng --video=<file> hoặc "file" trong meta.`);
  }
  return null;
}

// Đối số --lang=<x> (mặc định vi) → hậu tố file: '' cho vi, '.en' cho en…
function langOf(argv = process.argv) {
  const lang = argValue(argv, 'lang') || 'vi';
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) throw new Error(`--lang không hợp lệ: ${lang}`);
  return { lang, sfx: lang === 'vi' ? '' : `.${lang}` };
}

const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);

// Metadata đăng của project: <project>/publish/youtube-meta[.<lang>].json
function metaFile(dir, lang = 'vi') {
  return path.join(dir, 'publish', lang === 'vi' ? 'youtube-meta.json' : `youtube-meta.${lang}.json`);
}

module.exports = {
  ROOT, CHANNELS_DIR, PROJECTS_DIR, SECRETS_DIR, ARCHIVE_DIR,
  listChannels, channelOfProject, channel, projectDir, uploadRecord, resolveVideo, argValue, rel,
  archiveMirror, findMedia, findProjectVideo, langOf, readJson, metaFile,
};
