#!/usr/bin/env node
// ============================================================
//  publish/youtube/set-title.js — changes the TITLE of an UPLOADED video to match publish/youtube-meta[.<lang>].json
//
//  Run:  node publish/youtube/set-title.js <project-folder> [--lang=en] --yes
//    - WITHOUT --yes it only prints the old -> new title, nothing changes (an uploaded video belongs to the channel owner: run only
//      when the owner says so for that video)
//    - only changes snippet.title; description, tags, category and languages are read back from YouTube and sent unchanged (videos.update
//      with part snippet OVERWRITES the whole snippet — any missing field gets erased)
//    - only runs with the right channel's token; the video must belong to the channel
//    - costs ~51 quota units (videos.list 1 + videos.update 50)
// ============================================================

'use strict';

const studio = require('../lib/studio');
const { args, openYouTube, saveRecords, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Usage: set-title.js <project-folder> [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Needs a project folder (the new title comes from publish/youtube-meta*.json).');
  const metaFile = studio.metaFile(project, lang);
  const title = String((studio.readJson(metaFile) || {}).title || '').trim();
  if (!title) throw new Error(`No title in ${studio.rel(metaFile)}.`);
  if (title.length > 100) throw new Error(`Title is ${title.length} characters (> 100, YouTube rejects it).`);

  const yt = await openYouTube(ch);
  const res = await yt.youtube.videos.list({ part: ['snippet'], id: [videoId] });
  const v = (res.data.items || [])[0];
  if (!v) throw new Error(`Video ${videoId} not found on the channel.`);
  if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} does not belong to channel ${yt.channel.id}.`);
  const s = v.snippet;
  console.log(`Video ${videoId}: "${s.title}" -> "${title}"`);
  if (s.title === title) { console.log('No change needed.'); return; }
  if (!yes) { console.log('Nothing changed (missing --yes).'); return; }

  await yt.youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: videoId,
      snippet: {
        title,
        description: s.description,
        tags: s.tags,
        categoryId: s.categoryId,
        defaultLanguage: s.defaultLanguage,
        defaultAudioLanguage: s.defaultAudioLanguage,
      },
    },
  });
  const after = (await yt.youtube.videos.list({ part: ['snippet'], id: [videoId] })).data.items[0].snippet;
  if (after.title !== title) throw new Error(`YouTube still returns "${after.title}".`);
  if (after.description !== s.description || (after.tags || []).length !== (s.tags || []).length) {
    throw new Error('Description or tags changed after the update — check in Studio.');
  }
  saveRecords({ ch, project, lang, videoId, projectPatch: { title }, channelPatch: { title } });
  console.log(`✅ ${videoId}: "${after.title}" (description and ${(after.tags || []).length} tags unchanged)`);
}

main().catch(fail);
