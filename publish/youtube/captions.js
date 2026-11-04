#!/usr/bin/env node
// ============================================================
//  publish/youtube/captions.js — uploads caption tracks (.srt) to an uploaded video, one track per language
//
//  Run:  node publish/youtube/captions.js <project-folder> [--lang=en] [--langs vi,en] [--file x.srt] [--replace] [--merge] --yes
//    - STUDIO RULE: dubbed versions (VI or EN) ship WITHOUT captions — run only when the channel owner says so for that video
//    - file for each language L (first one found): publish/phu-de.L.srt, publish/captions.L.srt, out/phu-de.L.srt,
//      out/captions.L.srt (out/ is also looked up in the archive); --file only works with ONE language
//    - languages: --langs, else `captions` in youtube-meta*.json ([{ language, file }]), else every L that has a file
//    - captions are uploaded SEPARATELY (viewers turn them on/off), NOT burned into the picture
//    - a language that already has a (non-auto) track is skipped; --replace to replace it
//    - --merge: delete our own track and re-upload it UNNAMED -> Studio merges it into the shared language row. Never touches asr.
//    - WITHOUT --yes it only prints what it would do
//    - needs the youtube.force-ssl scope: if the token lacks it -> the channel owner reruns node publish/youtube/auth.js --channel=<channel>
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const { args, openYouTube, isScopeError, fail } = require('../lib/cli');

const LANG_NAMES = { vi: 'Tiếng Việt', en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', ja: '日本語', ko: '한국어', zh: '中文' }; // track names shown to viewers (data: each in its own language)

function captionFile(project, lang) {
  const cands = [
    path.join(project, 'publish', `phu-de.${lang}.srt`),
    path.join(project, 'publish', `captions.${lang}.srt`),
    path.join(project, 'out', `phu-de.${lang}.srt`),
    path.join(project, 'out', `captions.${lang}.srt`),
  ];
  for (const c of cands) { const f = studio.findMedia(c); if (f) return f; }
  return null;
}

function langsWithFiles(project) {
  const out = new Set();
  for (const d of ['publish', 'out']) {
    const dir = path.join(project, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) { const m = f.match(/^(?:phu-de|captions)\.([a-z]{2})\.srt$/); if (m) out.add(m[1]); }
  }
  return [...out];
}

async function main() {
  const a = args();
  const yes = a.has('yes');
  const replace = a.has('replace');
  const merge = a.has('merge');
  const target = a.pos[0];
  if (!target) throw new Error('Usage: node publish/youtube/captions.js <project-folder> [--lang=en] [--langs vi,en] [--replace] [--merge] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Needs a project folder (the .srt files live in the project).');
  const meta = studio.readJson(studio.metaFile(project, lang)) || {};

  let tracks;
  if (typeof a.flags.langs === 'string') {
    const langs = a.flags.langs.split(',').map((x) => x.trim()).filter(Boolean);
    if (typeof a.flags.file === 'string' && langs.length !== 1) throw new Error('--file only works with exactly one language in --langs.');
    tracks = langs.map((l) => ({ lang: l, file: typeof a.flags.file === 'string' ? path.resolve(a.flags.file) : captionFile(project, l) }));
  } else if (Array.isArray(meta.captions) && meta.captions.length) {
    tracks = meta.captions.map((c) => ({ lang: c.language || meta.language || lang, file: studio.findMedia(path.join(project, 'publish', c.file)) || path.join(project, 'publish', c.file) }));
  } else {
    tracks = langsWithFiles(project).map((l) => ({ lang: l, file: captionFile(project, l) }));
  }
  if (!tracks.length) throw new Error(`No caption files found in ${studio.rel(project)}/publish or out/ — pass --langs/--file.`);
  const missing = tracks.filter((t) => !t.file || !fs.existsSync(t.file));
  if (missing.length) throw new Error(`No caption file yet for: ${missing.map((t) => t.lang).join(', ')}`);

  const yt = await openYouTube(ch);
  const api = yt.youtube;
  const v = ((await api.videos.list({ part: ['snippet'], id: [videoId] })).data.items || [])[0];
  if (!v) throw new Error(`Video ${videoId} not found on the channel.`);
  if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} does not belong to channel ${yt.channel.id}.`);
  console.log(`Video ${videoId} "${v.snippet.title}"`);

  try {
    const list = await api.captions.list({ part: ['snippet'], videoId });
    for (const { lang: l, file } of tracks) {
      const name = merge ? '' : (LANG_NAMES[l] || l);
      let existing = (list.data.items || []).find((c) => c.snippet.language === l && c.snippet.trackKind !== 'asr');
      const what = existing
        ? (merge ? `delete "${existing.snippet.name}" and re-upload unnamed` : replace ? 'replace the existing track' : `skip (already has "${existing.snippet.name}", --replace to replace)`)
        : `upload track ${name ? `"${name}"` : 'unnamed'}`;
      console.log(`  ${l}: ${studio.rel(file)} → ${what}`);
      if (!yes) continue;
      if (merge && existing) {
        await api.captions.delete({ id: existing.id });
        console.log(`🗑  Deleted caption "${existing.snippet.name}" (${l}) from ${videoId} to re-upload it unnamed`);
        existing = null;
      }
      const media = { mimeType: 'application/octet-stream', body: fs.createReadStream(file) };
      if (existing) {
        if (!replace) continue;
        await api.captions.update({ part: ['snippet'], requestBody: { id: existing.id, snippet: { isDraft: false } }, media });
        console.log(`✅ Replaced the ${l} caption on ${videoId}`);
        continue;
      }
      const res = await api.captions.insert({
        part: ['snippet'],
        requestBody: { snippet: { videoId, language: l, name, isDraft: false } },
        media,
      });
      console.log(`✅ Uploaded caption ${name ? `"${name}" ` : 'unnamed '}(${l}) to ${videoId} (caption ${res.data.id})`);
    }
    if (!yes) console.log('Nothing uploaded (missing --yes).');
  } catch (e) {
    if (isScopeError(e)) {
      throw new Error(`Token lacks the captions scope (youtube.force-ssl). Sign in again: node publish/youtube/auth.js --channel=${ch.id}`);
    }
    throw e;
  }
}

main().catch(fail);
