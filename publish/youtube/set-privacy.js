#!/usr/bin/env node
// ============================================================
//  publish/youtube/set-privacy.js — changes the visibility of an UPLOADED video (private / unlisted / public)
//
//  Run:  node publish/youtube/set-privacy.js <project-folder | videoId --channel=<channel>> public|unlisted|private [--lang=en] --yes
//    - WITHOUT --yes it only prints what it would do, nothing changes (rule: go public only when the channel owner says so for that video)
//    - only touches status.privacyStatus, keeps the other status fields (license, embedding, made-for-kids…)
//    - only runs with the right channel's token (channelId in channels/<channel>/channel.js); the video must belong to the channel
//    - afterwards writes the status to <project>/publish/youtube[.<lang>].json and channels/<channel>/published/<id>.json
//    - costs ~51 quota units (videos.list 1 + videos.update 50)
// ============================================================

'use strict';

const studio = require('../lib/studio');
const { args, openYouTube, saveRecords, fail } = require('../lib/cli');

const VALID = ['public', 'unlisted', 'private'];

async function main() {
  const a = args();
  const yes = a.has('yes');
  const [target, privacy] = a.pos;
  if (!target || !VALID.includes(privacy)) throw new Error('Usage: set-privacy.js <project-folder | videoId> public|unlisted|private [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });

  const yt = await openYouTube(ch);
  const res = await yt.youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const v = (res.data.items || [])[0];
  if (!v) throw new Error(`Video ${videoId} not found on the channel.`);
  if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} does not belong to channel ${yt.channel.id}.`);
  const cur = v.status.privacyStatus;
  console.log(`Video ${videoId} "${v.snippet.title}": currently ${cur} -> ${privacy}`);
  if (cur === privacy) { console.log('No change needed.'); return; }
  if (!yes) { console.log('Nothing changed (missing --yes).'); return; }

  const s = v.status;
  await yt.youtube.videos.update({
    part: ['status'],
    requestBody: {
      id: videoId,
      status: {
        privacyStatus: privacy,
        embeddable: s.embeddable,
        license: s.license,
        publicStatsViewable: s.publicStatsViewable,
        selfDeclaredMadeForKids: s.selfDeclaredMadeForKids !== undefined ? s.selfDeclaredMadeForKids : !!s.madeForKids,
      },
    },
  });
  saveRecords({ ch, project, lang, videoId, projectPatch: { status: privacy }, channelPatch: { privacy } });
  console.log(`✅ Changed ${videoId} to ${privacy}`);
}

main().catch(fail);
