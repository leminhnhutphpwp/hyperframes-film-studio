#!/usr/bin/env node
// ============================================================
//  publish/youtube/delete.js — PERMANENTLY deletes a video from YouTube (cannot be undone)
//
//  Run:  node publish/youtube/delete.js <project-folder | videoId --channel=<channel>> [--lang=en] --yes
//    - WITHOUT --yes it only prints the video that would be deleted; nothing is deleted
//    - only deletes videos of the right channel (token must match channelId in channels/<channel>/channel.js)
//    - afterwards: the project's upload record is renamed to youtube[.<lang>].deleted-<date>.json (so it can be
//      re-uploaded while keeping a trace) and channels/<channel>/published/<videoId>.json is deleted
//    - costs 50 quota units
// ============================================================

'use strict';

const fs = require('fs');
const studio = require('../lib/studio');
const { args, openYouTube, publishedPath, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Usage: delete.js <project-folder | videoId --channel=<channel>> [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });

  const yt = await openYouTube(ch);
  const res = await yt.youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const v = (res.data.items || [])[0];
  if (!v) {
    console.log(`Video ${videoId} is no longer on YouTube (it may have been deleted already).`);
  } else {
    if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} does not belong to channel ${yt.channel.id} — refusing to delete.`);
    console.log(`Will delete: ${videoId} "${v.snippet.title}" (${v.status.privacyStatus})`);
  }
  const rec = publishedPath(ch, videoId);
  const projRec = project && studio.uploadRecord(project, lang);
  console.log(`  records to clean up: ${[fs.existsSync(rec) && studio.rel(rec), projRec && fs.existsSync(projRec) && studio.rel(projRec)].filter(Boolean).join(', ') || '(none)'}`);
  if (!yes) { console.log('Nothing deleted (missing --yes).'); return; }

  if (v) {
    await yt.youtube.videos.delete({ id: videoId });
    console.log(`✅ Deleted ${videoId} from YouTube`);
  }
  if (projRec && fs.existsSync(projRec)) {
    const cur = studio.readJson(projRec);
    if (cur && cur.videoId === videoId) {
      const to = projRec.replace(/\.json$/, `.deleted-${new Date().toISOString().slice(0, 10)}.json`);
      fs.renameSync(projRec, to);
      console.log(`   ${studio.rel(projRec)} → ${studio.rel(to)}`);
    }
  }
  if (fs.existsSync(rec)) { fs.unlinkSync(rec); console.log(`   deleted ${studio.rel(rec)}`); }
}

main().catch(fail);
