// ============================================================
//  publish/lib/facebook-project.js — shared code for publish/facebook/photo.js and video.js
//
//  A project of a channel with a fanpage keeps everything Facebook-related in <project>/publish/:
//    facebook_post.txt    video post text; the part after the "---" line is the first comment (YouTube link) — approved by the channel owner
//    facebook_photo.txt   photo post text (same format)
//    facebook_photo.jpg   image for the photo post (falls back to thumbnail.jpg)
//    facebook_cover.jpg   cover image for the video post
//    facebook.json        what has been posted: { videoId, url, commentId, postedAt, photo: {...} } — written by the scripts
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('./studio');
const { writeJson } = require('./cli');

function open(target) {
  const project = studio.projectDir(target);
  const ch = studio.channel({ project });
  const pub = path.join(project, 'publish');
  const stateFile = path.join(pub, 'facebook.json');
  const state = studio.readJson(stateFile, {});
  const yt = studio.readJson(studio.uploadRecord(project, 'vi'), {});
  const meta = studio.readJson(studio.metaFile(project, 'vi'), {});
  return {
    project, ch, pub, state, meta,
    youtubeId: yt.videoId || null,
    save: () => writeJson(stateFile, state),
  };
}

function readPost(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${studio.rel(file)} — write the post text (link comment after a --- line) and have the channel owner approve it`);
  const [desc, cmt] = fs.readFileSync(file, 'utf8').split(/^---\s*$/m);
  return { description: (desc || '').trim(), comment: (cmt || '').trim() };
}

// Live status of the video on YouTube (read-only).
async function youtubeStatus(ch, videoId) {
  if (!videoId) return null;
  try {
    const YouTubeProvider = require('./youtube');
    const yp = new YouTubeProvider(ch);
    await yp.initialize();
    const r = await yp.youtube.videos.list({ part: ['status'], id: [videoId] });
    const it = (r.data.items || [])[0];
    return it ? { privacy: it.status.privacyStatus } : { privacy: 'not found' };
  } catch (e) {
    console.log(`⚠️  Could not read YouTube: ${e.message}`);
    return null;
  }
}

module.exports = { open, readPost, youtubeStatus };
