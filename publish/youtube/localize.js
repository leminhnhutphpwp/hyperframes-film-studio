#!/usr/bin/env node
// ============================================================
//  publish/youtube/localize.js — translated TITLE + DESCRIPTION on an uploaded video (YouTube's "Translations" section)
//
//  Run:  node publish/youtube/localize.js <project-folder> [--lang=en] --yes
//    - reads `localizations` ({ en: { title, description } }) from publish/youtube-meta[.<lang>].json
//    - keeps the video's original title/description/category/tags; only adds or replaces the listed languages
//    - WITHOUT --yes it only prints what it would do (run only when the channel owner says so for that video)
//    - only runs with the right channel's token; the video must belong to the channel
//    - dubbed audio tracks have no API: Studio → Languages → Dubbing
// ============================================================
'use strict';

const studio = require('../lib/studio');
const { args, openYouTube, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Usage: node publish/youtube/localize.js <project-folder> [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Needs a project folder (translations come from publish/youtube-meta*.json).');
  const metaFile = studio.metaFile(project, lang);
  const meta = studio.readJson(metaFile);
  if (!meta) throw new Error(`Missing ${studio.rel(metaFile)}.`);
  const loc = meta.localizations || {};
  if (!Object.keys(loc).length) throw new Error(`${studio.rel(metaFile)} has no \`localizations\`.`);
  for (const [l, v] of Object.entries(loc)) {
    if (!v.title || !v.description) throw new Error(`localizations.${l} is missing title or description.`);
    if (v.title.length > 100) throw new Error(`localizations.${l}.title is ${v.title.length} > 100 characters.`);
    if (v.description.length > 5000) throw new Error(`localizations.${l}.description is ${v.description.length} > 5000 characters.`);
  }

  const yt = await openYouTube(ch);
  const api = yt.youtube;
  const cur = ((await api.videos.list({ part: ['snippet', 'localizations'], id: [videoId] })).data.items || [])[0];
  if (!cur) throw new Error(`Video ${videoId} not found on the channel.`);
  if (cur.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} does not belong to channel ${yt.channel.id}.`);
  const s = cur.snippet;
  const snippet = { title: s.title, description: s.description, categoryId: s.categoryId, tags: s.tags,
    defaultLanguage: s.defaultLanguage || meta.language || lang };
  const have = Object.keys(cur.localizations || {});
  console.log(`Video ${videoId} "${s.title}" (original language ${snippet.defaultLanguage})`);
  console.log(`  existing translations: ${have.join(', ') || '(none)'}`);
  for (const [l, v] of Object.entries(loc)) console.log(`  ${have.includes(l) ? 'replace' : 'add'} ${l}: "${v.title}"`);
  if (!yes) { console.log('Nothing changed (missing --yes).'); return; }

  const localizations = { ...(cur.localizations || {}), ...loc };
  await api.videos.update({ part: ['snippet', 'localizations'], requestBody: { id: videoId, snippet, localizations } });
  console.log(`✅ ${videoId}: translated title/description — ${Object.keys(loc).join(', ')} (original language ${snippet.defaultLanguage})`);
}

main().catch(fail);
