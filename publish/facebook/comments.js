#!/usr/bin/env node
// ============================================================
//  publish/facebook/comments.js — viewer comments on the fanpage that the page has NOT replied to + sending an approved reply
//
//  Run:  node publish/facebook/comments.js --channel=<channel>                                    # list (read-only)
//        node publish/facebook/comments.js --channel=<channel> --reply <commentId> "<reply text>"         # preview
//        node publish/facebook/comments.js --channel=<channel> --reply <commentId> "<reply text>" --yes   # send ONE approved reply
//
//  A reply is sent on the channel's behalf -> the agent drafts it, the CHANNEL OWNER APPROVES each one before --yes (no bulk sending).
//  Tone: refer to yourself as "mình", address viewers as "bạn/các bạn"; warm, short, on what they wrote; no links (unless they ask
//  for the link to the full story — it is already in the first comment). Never comment and reply to yourself to pad the numbers.
// ============================================================

'use strict';

const studio = require('../lib/studio');
const FB = require('../lib/facebook');
const { args, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const ch = studio.channel();
  const tok = FB.loadPageToken(ch);
  if (a.flags.reply !== undefined) {
    const id = a.flags.reply;
    const text = a.pos[0];
    if (typeof id !== 'string' || !text) throw new Error('Needs: --reply <commentId> "<reply text>"');
    const list = await FB.unansweredComments(tok.pageId, tok.access_token);
    const c = list.find((x) => x.commentId === id);
    if (!c) throw new Error(`Comment ${id} not found among unanswered comments (already answered, or wrong id)`);
    console.log(`↩️  ${c.from}: "${c.message}"\n   Reply: "${text}"`);
    if (!a.has('yes')) { console.log('(Preview — add --yes to send, once the channel owner has approved it)'); return; }
    const r = await FB.comment(id, tok.access_token, text);
    console.log(`✅ Replied (${r.id})`);
    return;
  }
  const list = await FB.unansweredComments(tok.pageId, tok.access_token);
  console.log(`Page: ${tok.pageName} (${tok.pageId})`);
  if (!list.length) { console.log('No viewer comments are waiting for a reply.'); return; }
  console.log(`💬 ${list.length} comments awaiting a reply:`);
  for (const c of list) console.log(`\n• [${c.commentId}] ${c.from} (${c.createdTime.slice(0, 16).replace('T', ' ')}): ${c.message}\n  on post: ${c.postText} — ${c.postUrl}`);
}

main().catch(fail);
