#!/usr/bin/env node
// ============================================================
//  publish/youtube/comment.js — posts the channel's FIRST comment on a public video
//
//  Run:  node publish/youtube/comment.js <project-folder> [--lang=en] [--yes] [--force]
//    - text: <project>/publish/comment[.<lang>].txt (drafted by the agent, approved by the channel owner)
//    - WITHOUT --yes it only prints a preview; nothing is posted
//    - on a private video YouTube refuses ("has disabled comments") — make it public first
//    - if the channel already has a comment on that video, skip (--force to post another)
//    - NO links in the comment (channel rule); the subscribe link lives in the description
//    - PINNING is up to the channel owner: the YouTube API cannot pin comments
//    - only runs with the right channel's token; needs the youtube.force-ssl scope
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const { args, openYouTube, isScopeError, fail } = require('../lib/cli');

const LINK_RE = /https?:\/\/|www\.|youtu\.be/i;

async function main() {
  const a = args();
  const yes = a.has('yes');
  const force = a.has('force');
  const target = a.pos[0];
  if (!target) throw new Error('Usage: node publish/youtube/comment.js <project-folder> [--lang=en] [--yes] [--force]');
  const { lang, sfx } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Needs a project folder (the comment comes from publish/comment*.txt).');

  const file = path.join(project, 'publish', `comment${sfx}.txt`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${studio.rel(file)} — write the first comment (approved by the channel owner) and run again.`);
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) throw new Error(`${studio.rel(file)} is empty.`);
  if (LINK_RE.test(text)) throw new Error(`${path.basename(file)} contains a link — channel rule: no links in comments (the subscribe link goes in the description).`);

  console.log(`💬 ${studio.rel(project)} → https://www.youtube.com/watch?v=${videoId}\n${'─'.repeat(60)}\n${text}\n${'─'.repeat(60)}`);
  if (!yes) { console.log('(preview — add --yes to post for real)'); return; }

  const yt = await openYouTube(ch);
  const api = yt.youtube;
  try {
    if (!force) {
      const mine = await api.commentThreads.list({ part: ['snippet'], videoId, maxResults: 50, textFormat: 'plainText' });
      const own = (mine.data.items || []).find((t) => t.snippet.topLevelComment.snippet.authorChannelId
        && t.snippet.topLevelComment.snippet.authorChannelId.value === yt.channel.id);
      if (own) { console.log(`⏭  The channel already has a comment on ${videoId} — add --force if you really want to post another.`); return; }
    }
    const res = await api.commentThreads.insert({
      part: ['snippet'],
      requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } },
    });
    console.log(`✅ Posted the first comment on ${videoId} (${res.data.id})`);
    console.log('   Please pin it — the YouTube API cannot pin comments.');
  } catch (e) {
    if (isScopeError(e)) throw new Error(`Token lacks the comment scope (youtube.force-ssl). Sign in again: node publish/youtube/auth.js --channel=${ch.id}`);
    if (/disabled comments/i.test(String(e.message))) throw new Error(`${videoId} has comments disabled — YouTube blocks them on private videos; make it public and run again.`);
    throw e;
  }
}

main().catch(fail);
