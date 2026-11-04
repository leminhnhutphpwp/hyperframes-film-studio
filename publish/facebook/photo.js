#!/usr/bin/env node
// ============================================================
//  publish/facebook/photo.js — posts a PHOTO post to the fanpage + a YouTube link comment
//
//  Run:  node publish/facebook/photo.js <project-folder>                         # check + preview (posts nothing)
//        node publish/facebook/photo.js <project-folder> --yes                   # post (only when the channel owner says so)
//        node publish/facebook/photo.js <project-folder> --comment-only [--yes]  # send a missing link comment
//        (--again to post again when a post already exists)
//
//  Reads <project>/publish/: facebook_photo.txt (text; the part after "---" is the first comment), facebook_photo.jpg
//  (falls back to thumbnail.jpg), youtube.json (videoId to check the link). The link goes in the comment (Facebook ranks posts
//  with links lower). Text checks (lib/facebook-check.js checkText): body text, no link in the post, ≤ 3 hashtags
//  without diacritics, link to the right episode, YouTube video is public. Any ✗ stops the run.
//  Writes publish/facebook.json → photo: { postId, photoId, url, commentId, postedAt }.
//  AI label: the API cannot set it — the channel owner adds it on the web.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const FB = require('../lib/facebook');
const { checkText } = require('../lib/facebook-check');
const { open, readPost, youtubeStatus } = require('../lib/facebook-project');
const { args, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const target = a.pos[0];
  if (!target) throw new Error('Usage: node publish/facebook/photo.js <project-folder> [--yes] [--comment-only] [--again]');
  const yes = a.has('yes');
  const P = open(target);
  const post = readPost(path.join(P.pub, 'facebook_photo.txt'));
  const tok = FB.loadPageToken(P.ch);
  const done = P.state.photo;

  if (a.has('comment-only')) {
    if (!done || !done.postId) throw new Error('This project has no photo post yet');
    if (done.commentId) { console.log(`Comment already exists: ${done.commentId}`); return; }
    if (!post.comment) throw new Error('facebook_photo.txt has no comment (the part after ---)');
    if (!yes) { console.log(`Will comment on ${done.postId}:\n${post.comment}\n(add --yes to send)`); return; }
    done.commentId = (await FB.comment(done.postId, tok.access_token, post.comment)).id;
    P.save();
    console.log(`✅ Commented ${done.commentId}`);
    return;
  }
  if (done && done.postId && !a.has('again')) { console.log(`This project already has a photo post: ${done.url || done.postId} (--again to post again)`); return; }

  const own = path.join(P.pub, 'facebook_photo.jpg');
  const img = fs.existsSync(own) ? own : path.join(P.pub, 'thumbnail.jpg');
  if (!fs.existsSync(img)) throw new Error(`No image: needs ${studio.rel(own)} or publish/thumbnail.jpg`);
  const checks = checkText({ state: { videoId: P.youtubeId }, post, ytStatus: await youtubeStatus(P.ch, P.youtubeId) });
  const mb = fs.statSync(img).size / 1e6;
  checks.push({ ok: /\.jpe?g$/i.test(img) && mb <= 4, item: 'JPEG image ≤ 4 MB', detail: `${studio.rel(img)} · ${mb.toFixed(1)} MB` });
  console.log(`\n🖼  Fanpage photo post ${tok.pageName} — ${studio.rel(P.project)}`);
  for (const c of checks) console.log(`   ${c.ok ? '✓' : '✗'} ${c.item}: ${c.detail}`);
  console.log(`\n   Text:\n   ${post.description.replace(/\n/g, '\n   ')}\n   First comment:\n   ${post.comment}`);
  if (checks.some((c) => !c.ok)) throw new Error('Some checks failed (✗) — fix them and run again; nothing posted');
  if (!yes) { console.log('\n(Preview — not posted. Add --yes when the channel owner says to post.)'); return; }

  const r = await FB.uploadPhoto({ pageId: tok.pageId, token: tok.access_token, file: img, message: post.description });
  const postId = r.post_id || `${tok.pageId}_${r.id}`;
  P.state.photo = { postId, photoId: r.id, url: `https://www.facebook.com/${postId}`, postedAt: new Date().toISOString() };
  P.save();
  try {
    if (post.comment) P.state.photo.commentId = (await FB.comment(postId, tok.access_token, post.comment)).id;
  } catch (e) { console.log(`⚠️  Link comment failed: ${e.message} (rerun with --comment-only --yes)`); }
  P.save();
  console.log(`\n✅ Posted the photo post: ${P.state.photo.url}${P.state.photo.commentId ? ' + link comment' : ''}`);
  console.log('   Remember to add the "AI content" label on the web if wanted (the API cannot set it).');
}

main().catch(fail);
