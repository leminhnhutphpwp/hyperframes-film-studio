#!/usr/bin/env node
// ============================================================
//  publish/youtube/upload.js — uploads ONE project to its channel (PRIVATE), with thumbnail, translations, playlist, captions
//
//  Run:  node publish/youtube/upload.js <project-folder> [--lang=en]            # preview: checks files, sends nothing
//        node publish/youtube/upload.js <project-folder> [--lang=en] --yes      # upload (only when the channel owner asks)
//  Channel comes from the folder: projects/<channel>/<film>[/<part>]. The token must belong to that channel (assertExpectedChannel).
//
//  Reads from <project>/publish/:
//    youtube-meta[.<lang>].json  title, description, tags, language, madeForKids, categoryId?, localizations?,
//                                playlist? (playlist name; created PRIVATE if missing, description = playlistDescription),
//                                captions? ([{ language, file }] .srt files in publish/ — only if the channel owner wants them),
//                                file? (video path, relative to the project)
//    thumbnail[.<lang>].jpg      thumbnail image (≤ 2 MB)
//  Video: meta.file, or --video=<file>, or the single .mp4 for that language in <project>/out/ (or its copy
//  in the archive $STUDIO_ARCHIVE/<same path> (default archive/)).
//
//  Rules:
//    - always uploads PRIVATE. Other visibility only with both --privacy=<x> AND --yes (channel owner says so for that video)
//    - the video language must be the channel's language (channel.js language, default vi): English versions go to a separate
//      English channel — --other-language overrides this (only when the channel owner says so)
//    - if publish/youtube[.<lang>].json exists the video is already uploaded → skip, no re-upload
//  Writes: <project>/publish/youtube[.<lang>].json { videoId, title, url, status, uploadedAt }
//          channels/<channel>/published/<videoId>.json { videoId, title, url, privacy, uploadedAt, project, language }
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const { args, openYouTube, publishedPath, writeJson, isScopeError, fail } = require('../lib/cli');

const PRIVACY = ['private', 'unlisted', 'public'];

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Usage: node publish/youtube/upload.js <project-folder> [--lang=en] [--yes]');
  const project = studio.projectDir(target);
  const ch = studio.channel({ project });
  const { lang, sfx } = studio.langOf();
  const pub = path.join(project, 'publish');
  const metaFile = studio.metaFile(project, lang);
  const record = studio.uploadRecord(project, lang);

  if (fs.existsSync(record)) {
    const r = studio.readJson(record);
    console.log(`⏭  ${studio.rel(project)} (${lang}) already uploaded: ${r.url || r.videoId} (${r.status || '?'}) — not re-uploading.`);
    return;
  }
  const meta = studio.readJson(metaFile);
  if (!meta) throw new Error(`Missing ${studio.rel(metaFile)}.`);

  // ---------- checks ----------
  const problems = [];
  const notes = [];
  const title = String(meta.title || '').trim();
  if (!title) problems.push('meta has no title');
  if (title.length > 100) problems.push(`title is ${title.length} characters (> 100)`);
  if (!meta.description) problems.push('meta has no description');
  if ((meta.description || '').length > 5000) problems.push(`description is ${meta.description.length} characters (> 5000)`);
  if (/[<>]/.test(title + (meta.description || ''))) problems.push('title/description contains < or > (YouTube rejects them)');
  const tagLen = (meta.tags || []).join(',').length;
  if (tagLen > 500) problems.push(`tags are ${tagLen} characters long (> 500)`);

  const vidLang = meta.language || lang;
  const chLang = ch.config.language || 'vi';
  if (vidLang !== chLang && !a.has('other-language')) {
    problems.push(`video language is "${vidLang}" but channel ${ch.id} is "${chLang}" — this version is for another channel (--other-language only when the channel owner says so)`);
  }

  let privacy = 'private';
  if (a.flags.privacy !== undefined) {
    if (!PRIVACY.includes(a.flags.privacy)) problems.push(`--privacy must be ${PRIVACY.join('|')}`);
    else privacy = a.flags.privacy;
  }
  if (meta.privacyStatus && meta.privacyStatus !== 'private' && meta.privacyStatus !== privacy) {
    notes.push(`meta says privacyStatus "${meta.privacyStatus}" — ignored, uploading as ${privacy}`);
  }

  let video = null;
  try {
    if (typeof a.flags.video === 'string') video = path.resolve(a.flags.video);
    else if (meta.file) video = studio.findMedia(path.join(project, meta.file)) || path.join(project, meta.file);
    else video = studio.findProjectVideo(project, lang);
  } catch (e) { problems.push(e.message); }
  if (!video) problems.push(`no video${sfx ? ` (*${sfx}.mp4)` : ''} found in ${studio.rel(path.join(project, 'out'))} or the archive`);
  else if (!fs.existsSync(video)) problems.push(`missing ${video}`);

  const thumb = path.join(pub, `thumbnail${sfx}.jpg`);
  if (!fs.existsSync(thumb)) notes.push(`no ${studio.rel(thumb)} — skipping thumbnail`);
  else if (fs.statSync(thumb).size > 2 * 1024 * 1024) problems.push(`${path.basename(thumb)} is larger than 2 MB`);

  const loc = meta.localizations || {};
  for (const [l, v] of Object.entries(loc)) {
    if (!v.title || !v.description) problems.push(`localizations.${l} is missing title or description`);
    else if (v.title.length > 100) problems.push(`localizations.${l}.title > 100 characters`);
  }

  const caps = (Array.isArray(meta.captions) ? meta.captions : []).map((c) => ({
    language: c.language || vidLang, file: path.join(pub, c.file), name: c.name || '',
  }));
  for (const c of caps) if (!fs.existsSync(c.file)) problems.push(`missing caption file ${studio.rel(c.file)}`);

  // ---------- print ----------
  console.log(`Channel: ${ch.config.name} (${ch.id}) · project ${studio.rel(project)} · language ${lang}`);
  console.log(`  video:      ${video ? `${video}${fs.existsSync(video) ? ` (${(fs.statSync(video).size / 1048576).toFixed(1)} MB)` : ''}` : '(not found)'}`);
  console.log(`  title:      ${title}`);
  console.log(`  privacy:    ${privacy}${privacy !== 'private' ? '  ⚠️  NOT private' : ''}`);
  console.log(`  category:   ${meta.categoryId || ch.config.defaultCategoryId || '24'} · ${(meta.tags || []).length} tags · madeForKids ${!!meta.madeForKids}`);
  console.log(`  thumbnail:  ${fs.existsSync(thumb) ? studio.rel(thumb) : '(none)'}`);
  console.log(`  translated: ${Object.keys(loc).join(', ') || '(none)'}`);
  console.log(`  playlist:   ${meta.playlist || '(none)'}`);
  console.log(`  captions:   ${caps.map((c) => `${c.language} ${path.basename(c.file)}`).join(', ') || '(none)'}`);
  for (const n of notes) console.log(`  · ${n}`);
  if (problems.length) {
    for (const p of problems) console.log(`  ✗ ${p}`);
    throw new Error(`${problems.length} checks failed — fix them and run again; nothing was sent.`);
  }

  if (!yes) {
    // Preview: read-only — is the token for the right channel, does the playlist exist yet.
    try {
      const yt = await openYouTube(ch);
      console.log(`  ✓ token belongs to channel ${yt.channel.snippet.title} (${yt.channel.id})`);
      if (meta.playlist) {
        const pl = await yt.findPlaylistByTitle(meta.playlist);
        console.log(`  ${pl ? `✓ playlist exists (${pl.playlistId})` : '· playlist does not exist yet — it will be created PRIVATE'}`);
      }
    } catch (e) { console.log(`  ✗ YouTube: ${e.message}`); }
    console.log('\n(Preview — nothing uploaded. When the channel owner says to upload, run again with --yes.)');
    return;
  }

  // ---------- upload ----------
  const yt = await openYouTube(ch);
  console.log(`\nChannel: ${yt.channel.snippet.title} (${yt.channel.id})`);
  const r = await yt.uploadVideo(video, {
    ...meta, title, privacyStatus: privacy, language: vidLang,
    categoryId: meta.categoryId || ch.config.defaultCategoryId || '24',
  });
  // Record it RIGHT AWAY so the next run does not upload a duplicate, even if a later step fails.
  writeJson(record, { videoId: r.videoId, title: r.title, url: r.url, status: r.status, uploadedAt: r.uploadedAt });
  writeJson(publishedPath(ch, r.videoId), {
    videoId: r.videoId, title: r.title, url: r.url, privacy: r.status, uploadedAt: r.uploadedAt,
    project: path.relative(studio.ROOT, project), language: vidLang,
  });
  console.log(`✅ Uploaded ${r.url} (${r.status}) — wrote ${studio.rel(record)}`);

  const warn = [];
  if (fs.existsSync(thumb)) {
    try { await yt.setThumbnail(r.videoId, thumb); console.log('✅ thumbnail'); } catch (e) { warn.push(`thumbnail: ${e.message}`); }
  }
  if (Object.keys(loc).length) {
    try {
      const v = (await yt.youtube.videos.list({ part: ['snippet'], id: [r.videoId] })).data.items[0].snippet;
      await yt.youtube.videos.update({
        part: ['snippet', 'localizations'],
        requestBody: {
          id: r.videoId,
          snippet: { title: v.title, description: v.description, tags: v.tags, categoryId: v.categoryId,
            defaultLanguage: vidLang, defaultAudioLanguage: v.defaultAudioLanguage || vidLang },
          localizations: loc,
        },
      });
      console.log(`✅ translations: ${Object.keys(loc).join(', ')}`);
    } catch (e) { warn.push(`translations: ${e.message} (rerun: node publish/youtube/localize.js ${studio.rel(project)}${sfx ? ` --lang=${lang}` : ''} --yes)`); }
  }
  if (meta.playlist) {
    try {
      let pl = await yt.findPlaylistByTitle(meta.playlist);
      if (!pl) {
        const res = await yt.youtube.playlists.insert({
          part: ['snippet', 'status'],
          requestBody: { snippet: { title: meta.playlist, description: meta.playlistDescription || '', defaultLanguage: vidLang },
            status: { privacyStatus: 'private' } },
        });
        pl = { playlistId: res.data.id, title: meta.playlist };
        console.log(`✅ created private playlist "${meta.playlist}" (${pl.playlistId})`);
        await new Promise((ok) => setTimeout(ok, 15000)); // new playlist: playlistItems cannot see it for a few seconds
      }
      if (!(await yt.isVideoInPlaylist(pl.playlistId, r.videoId))) await yt.addVideoToPlaylist(pl.playlistId, r.videoId);
      console.log(`✅ in playlist "${meta.playlist}"`);
    } catch (e) { warn.push(`playlist: ${e.message}`); }
  }
  for (const c of caps) {
    try {
      const res = await yt.youtube.captions.insert({
        part: ['snippet'],
        requestBody: { snippet: { videoId: r.videoId, language: c.language, name: c.name, isDraft: false } },
        media: { mimeType: 'application/octet-stream', body: fs.createReadStream(c.file) },
      });
      console.log(`✅ captions ${c.language} (${res.data.id})`);
    } catch (e) {
      warn.push(`captions ${c.language}: ${isScopeError(e) ? `token lacks the youtube.force-ssl scope — the channel owner runs publish/youtube/auth.js --channel=${ch.id}` : e.message}`);
    }
  }
  for (const w of warn) console.log(`⚠️  ${w}`);
  console.log(`\nVideo is ${r.status}. Publishing / scheduling / end screens: the channel owner does these in Studio.`);
}

main().catch(fail);
