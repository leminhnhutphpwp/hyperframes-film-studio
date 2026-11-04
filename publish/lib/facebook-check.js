// ============================================================
//  src/publish/facebook-check.js — checks an episode BEFORE it is posted to the fanpage
//
//  Used by publish/facebook/video.js (runs before every post, including previews).
//  checkFullVideo(): video post of the FULL episode — the current way of posting.
//  checkEpisode():   9:16 Reel cut from the teaser — the old way, kept for episodes posted that way.
//  Reels spec per developers.facebook.com/docs/video-api/guides/reels-publishing:
//  mp4 H.264, 9:16 (1080×1920 recommended, min 540×960), 3–90 s, 24–60 fps, closed GOP 2–5 s,
//  AAC stereo 48 kHz ≥128 kbps; API max 30 Reels / 24 hours. Cover ≤10 MB, same aspect ratio as the video.
//  Returns [{ ok, item, detail }] — any failed item means the post must not go out.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// System ffmpeg / ffprobe (apt); override with FFMPEG / FFPROBE if needed.
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';

function probe(file) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries',
    'stream=codec_type,codec_name,width,height,avg_frame_rate,channels,sample_rate,bit_rate:format=duration',
    '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout || '{}');
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  const a = (j.streams || []).find((s) => s.codec_type === 'audio') || {};
  const [n, d] = String(v.avg_frame_rate || '0/1').split('/').map(Number);
  return { v, a, fps: d ? n / d : 0, dur: Number((j.format || {}).duration || 0) };
}

// Largest gap between two keyframes (seconds).
function maxKeyframeGap(file, dur) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const t = (r.stdout || '').split('\n').filter((l) => /,K/.test(l)).map((l) => Number(l.split(',')[0]))
    .filter((x) => Number.isFinite(x));
  t.push(dur);
  let gap = 0;
  for (let i = 1; i < t.length; i++) gap = Math.max(gap, t[i] - t[i - 1]);
  return gap;
}

// Mean brightness (0–255) of the first frame — a black first frame makes the cover/feed placeholder black.
function firstFrameLuma(file) {
  const r = spawnSync(ffmpeg, ['-v', 'info', '-i', file, '-frames:v', '1', '-vf', 'signalstats,metadata=print', '-f', 'null', '-'],
    { encoding: 'utf8' });
  const m = (r.stderr || '').match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function imageSize(file) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = (r.stdout || '').trim().split(',').map(Number);
  return { w, h };
}

const YT_ID = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;

// state: project.json; post: {description, comment}; ytStatus: {privacy} read live from YouTube (or null).
function checkEpisode({ state, video, cover, post, ytStatus }) {
  const out = [];
  const add = (ok, item, detail) => out.push({ ok, item, detail });

  // --- video ---
  if (!fs.existsSync(video)) { add(false, 'Clip', `missing ${video}`); return out; }
  const p = probe(video);
  add(p.v.codec_name === 'h264', 'Video codec', p.v.codec_name);
  add(p.v.width === 1080 && p.v.height === 1920, 'Frame 9:16', `${p.v.width}×${p.v.height}`);
  add(p.dur >= 3 && p.dur <= 90, 'Duration 3–90 s', `${p.dur.toFixed(1)} s`);
  add(p.fps >= 24 && p.fps <= 60, 'Frame rate 24–60 fps', p.fps.toFixed(2));
  add(p.a.codec_name === 'aac' && Number(p.a.channels) === 2 && Number(p.a.sample_rate) === 48000,
    'Audio AAC stereo 48 kHz', `${p.a.codec_name} ${p.a.channels}ch ${p.a.sample_rate} Hz`);
  const gap = maxKeyframeGap(video, p.dur);
  add(gap <= 5.05, 'Keyframe ≤ 5 s (closed GOP)', `${gap.toFixed(2)} s`);
  const y = firstFrameLuma(video);
  add(y !== null && y > 24, 'First frame not black', y === null ? 'could not measure' : `brightness ${y.toFixed(0)}/255`);
  const src = state.videoPath && fs.existsSync(state.videoPath) ? fs.statSync(state.videoPath).mtimeMs : 0;
  add(fs.statSync(video).mtimeMs >= src, 'Clip cut from the latest render', src ? 'newer than the main video' : 'main video not found');

  // --- cover image ---
  if (fs.existsSync(cover)) {
    const s = imageSize(cover);
    const mb = fs.statSync(cover).size / 1e6;
    add(Math.abs(s.w / s.h - 9 / 16) < 0.01 && mb <= 10, 'Cover 9:16 ≤ 10 MB', `${s.w}×${s.h}, ${mb.toFixed(1)} MB`);
  } else add(false, 'Cover image', `missing ${path.basename(cover)}`);

  return out.concat(checkText({ state, post, ytStatus }));
}

// TEXT part of a post (Reel or photo post): body text, no link in the post, hashtags, link to the right episode, video public.
function checkText({ state, post, ytStatus, full = false }) {
  const out = [];
  const add = (ok, item, detail) => out.push({ ok, item, detail });
  const d = post.description || '';
  add(d.length >= 20, 'Post has body text', `${d.length} chars`);
  add(!/https?:\/\//i.test(d), 'No link in the post body', 'link goes in the comment');
  const tags = d.match(/#\S+/g) || [];
  add(tags.length <= 3 && tags.every((t) => /^#[a-z0-9_]+$/.test(t)), 'Hashtags ≤ 3, no diacritics', tags.join(' ') || '(none)');
  // A full-episode post must not keep the teaser-era "listen to the opening" invitations (regex matches Vietnamese post text).
  if (full) add(!/nghe thử|đoạn đầu|coi thử/i.test(d), 'No teaser-style invitations left',
    /nghe thử|đoạn đầu|coi thử/i.test(d) ? 'post still reads like a teaser clip' : 'written for a full-episode post');
  const m = (post.comment || '').match(YT_ID);
  add(!!m && m[1] === state.videoId, 'YouTube link points to this episode', m ? `${m[1]} ${m[1] === state.videoId ? '=' : '≠'} ${state.videoId}` : 'comment has no link');
  if (ytStatus) add(ytStatus.privacy === 'public', 'YouTube video is public', ytStatus.privacy);
  else add(false, 'YouTube video is public', 'could not read status from YouTube');
  return out;
}

// Video post of the FULL episode on the fanpage (no more teaser cuts, but still vertical like the
// earlier posts, with the story title at the top of the frame).
// The posted file is output/fanpage_9x16.mp4 (src/render/fanpage-video.js): 1080×1920, the whole episode.
function checkFullVideo({ state, video, cover, post, ytStatus, title = '' }) {
  const out = [];
  const add = (ok, item, detail) => out.push({ ok, item, detail });

  if (!fs.existsSync(video)) { add(false, 'Video', `missing ${video}`); return out; }
  const p = probe(video);
  const mb = fs.statSync(video).size / 1e6;
  add(p.v.codec_name === 'h264', 'Video codec', p.v.codec_name);
  add(p.v.width === 1080 && p.v.height === 1920, 'Vertical frame 9:16', `${p.v.width}×${p.v.height}`);
  add(p.dur >= 60 && p.dur <= 4 * 3600, 'Duration ≥ 1 min (Facebook allows up to 4 hours)', `${(p.dur / 60).toFixed(1)} min`);
  add(p.fps >= 24 && p.fps <= 60, 'Frame rate 24–60 fps', p.fps.toFixed(2));
  add(p.a.codec_name === 'aac' && Number(p.a.channels) === 2 && Number(p.a.sample_rate) === 48000,
    'Audio AAC stereo 48 kHz', `${p.a.codec_name} ${p.a.channels}ch ${p.a.sample_rate} Hz`);
  add(mb <= 1024, 'Size ≤ 1 GB (single upload)', `${mb.toFixed(0)} MB`);
  const y = firstFrameLuma(video);
  add(y !== null && y > 24, 'First frame not black', y === null ? 'could not measure' : `brightness ${y.toFixed(0)}/255`);
  const srcMs = state.videoPath && fs.existsSync(state.videoPath) ? fs.statSync(state.videoPath).mtimeMs : 0;
  add(!!srcMs && fs.statSync(video).mtimeMs >= srcMs, 'Built from the latest render',
    srcMs ? 'newer than the main video' : 'main video not found');
  const srcDur = srcMs ? probe(state.videoPath).dur : 0;
  add(!srcDur || Math.abs(p.dur - srcDur) <= 1.5, 'Full episode, not cut',
    srcDur ? `${p.dur.toFixed(0)} s / ${srcDur.toFixed(0)} s of the render` : 'could not measure');
  add(!!title && !/^[a-z0-9_]+$/.test(title), 'Video name is the title, not a slug', title || '(empty)');

  if (fs.existsSync(cover)) {
    const s2 = imageSize(cover);
    const cmb = fs.statSync(cover).size / 1e6;
    add(Math.abs(s2.w / s2.h - 9 / 16) < 0.01 && cmb <= 10, 'Cover 9:16 ≤ 10 MB', `${s2.w}×${s2.h}, ${cmb.toFixed(1)} MB`);
  } else add(false, 'Cover image', `missing ${path.basename(cover)}`);

  return out.concat(checkText({ state, post, ytStatus, full: true }));
}

module.exports = { checkEpisode, checkFullVideo, checkText, probe, maxKeyframeGap, firstFrameLuma };
