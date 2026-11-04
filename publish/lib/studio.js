// ============================================================
//  publish/lib/studio.js — studio paths + channel selection for every publish / analytics command
//
//  Channel is resolved in this order: project folder (projects/<channel>/<film>) → --channel=<channel> → STUDIO_CHANNEL.
//  No guessing: a missing channel is an error, so nothing is ever posted to the wrong channel.
//
//  channels/<channel>/channel.js   identity (channelId, name, tags, language…) — committed to git
//  channels/<channel>/published/   records of uploaded videos (<videoId>.json) — committed to git
//  secrets/google-oauth-client.json            Google Cloud OAuth client (shared) — git-ignored
//  secrets/<channel>/youtube-token.json        YouTube token for that exact channel — git-ignored
//  secrets/<channel>/facebook-token.json       Facebook page token (if the channel has a fanpage)
//  .env (studio root)                          API keys (FB_APP_ID, XAH_…) — git-ignored
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const CHANNELS_DIR = path.join(ROOT, 'channels');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const SECRETS_DIR = path.join(ROOT, 'secrets');
// Rendered videos are moved out of <project>/out/ into an archive, keeping the same path relative to projects/
// (see <film>/archived.json). Change the archive location with STUDIO_ARCHIVE=/some/path.
const ARCHIVE_DIR = process.env.STUDIO_ARCHIVE || path.join(ROOT, 'archive');

function listChannels() {
  return fs.readdirSync(CHANNELS_DIR).filter((d) => fs.existsSync(path.join(CHANNELS_DIR, d, 'channel.js')));
}

// projects/<channel>/<film>[/<part>] → <channel>; outside projects/ → null
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

// The channel for this command: { id, dir, config, secrets, published }
function channel({ project, argv = process.argv } = {}) {
  const fromProject = project ? channelOfProject(project) : null;
  const fromArg = argValue(argv, 'channel');
  if (fromProject && fromArg && fromProject !== fromArg) {
    throw new Error(`Project belongs to channel "${fromProject}" but --channel=${fromArg} — stopping.`);
  }
  let id = fromProject || fromArg || process.env.STUDIO_CHANNEL;
  // a project's other-language cut can belong to a sister channel: channel.js languageChannels { en: '<channel>' }
  // Applies to project commands run with --lang=<x>.
  const lang = argValue(argv, 'lang');
  if (fromProject && lang && listChannels().includes(id)) {
    const cfg = require(path.join(CHANNELS_DIR, id, 'channel.js'));
    if (cfg.languageChannels && cfg.languageChannels[lang]) id = cfg.languageChannels[lang];
  }
  const known = listChannels();
  if (!id) throw new Error(`No channel selected: add --channel=<${known.join('|')}> (or run from a project folder).`);
  if (!known.includes(id)) throw new Error(`No channel "${id}" in channels/ (available: ${known.join(', ')}).`);
  const dir = path.join(CHANNELS_DIR, id);
  return {
    id,
    dir,
    config: require(path.join(dir, 'channel.js')),
    secrets: path.join(SECRETS_DIR, id),
    published: path.join(dir, 'published'),
  };
}

// Project folder from an argument (relative to cwd or the studio root).
function projectDir(arg) {
  for (const p of [path.resolve(arg), path.join(ROOT, arg)]) if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  throw new Error(`Project folder not found: ${arg}`);
}

// The project's upload record: <project>/publish/youtube[.<lang>].json (videoId, url, status)
function uploadRecord(dir, lang = 'vi') {
  return path.join(dir, 'publish', lang === 'vi' ? 'youtube.json' : `youtube.${lang}.json`);
}

// videoId from an argument: a videoId (11 characters) or an already-uploaded project folder.
function resolveVideo(arg, { lang = 'vi', argv = process.argv } = {}) {
  if (/^[A-Za-z0-9_-]{11}$/.test(arg) && !fs.existsSync(arg)) {
    return { videoId: arg, project: null, channel: channel({ argv }) };
  }
  const dir = projectDir(arg);
  const rec = uploadRecord(dir, lang);
  if (!fs.existsSync(rec)) throw new Error(`Project has not been uploaded (no ${path.relative(ROOT, rec)}).`);
  const { videoId } = JSON.parse(fs.readFileSync(rec, 'utf8'));
  return { videoId, project: dir, channel: channel({ project: dir, argv }) };
}

function rel(p) {
  return path.relative(ROOT, p);
}

// Archive copy of a file under projects/ (null if the file is not under projects/).
function archiveMirror(p) {
  const r = path.relative(PROJECTS_DIR, path.resolve(p));
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
  return path.join(ARCHIVE_DIR, r);
}

// A project file: the original location if it still exists, else the archive copy; neither → null.
function findMedia(p) {
  if (fs.existsSync(p)) return p;
  const m = archiveMirror(p);
  return m && fs.existsSync(m) ? m : null;
}

// The project's video file for language lang: <name>.mp4 (vi) or <name>.<lang>.mp4, in out/ or the archive.
function findProjectVideo(project, lang) {
  const out = path.join(project, 'out');
  const dirs = [out, archiveMirror(out)].filter((d) => d && fs.existsSync(d));
  const want = (f) => f.endsWith('.mp4') && (lang === 'vi' ? !/\.[a-z]{2}\.mp4$/.test(f) : f.endsWith(`.${lang}.mp4`));
  for (const d of dirs) {
    const hits = fs.readdirSync(d).filter(want).filter((f) => !/preview|draft|test/i.test(f));
    if (hits.length === 1) return path.join(d, hits[0]);
    if (hits.length > 1) throw new Error(`Found ${hits.length} videos in ${d} (${hits.join(', ')}) — pick one with --video=<file> or "file" in the meta.`);
  }
  return null;
}

// --lang=<x> argument (default vi) → file suffix: '' for vi, '.en' for en…
function langOf(argv = process.argv) {
  const lang = argValue(argv, 'lang') || 'vi';
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) throw new Error(`Invalid --lang: ${lang}`);
  return { lang, sfx: lang === 'vi' ? '' : `.${lang}` };
}

const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);

// The project's upload metadata: <project>/publish/youtube-meta[.<lang>].json
function metaFile(dir, lang = 'vi') {
  return path.join(dir, 'publish', lang === 'vi' ? 'youtube-meta.json' : `youtube-meta.${lang}.json`);
}

module.exports = {
  ROOT, CHANNELS_DIR, PROJECTS_DIR, SECRETS_DIR, ARCHIVE_DIR,
  listChannels, channelOfProject, channel, projectDir, uploadRecord, resolveVideo, argValue, rel,
  archiveMirror, findMedia, findProjectVideo, langOf, readJson, metaFile,
};
