// ============================================================
//  src/publish/facebook-check.js — kiểm tra một tập TRƯỚC khi đăng lên fanpage
//
//  Dùng bởi publish/facebook/video.js (chạy trước mọi lần đăng, cả khi xem trước).
//  checkFullVideo(): bài video NGUYÊN tập, khung ngang — cách đăng hiện nay (người dùng 21/09/2026).
//  checkEpisode():   Reel 9:16 cắt từ teaser — cách cũ, giữ lại cho mấy tập đã đăng trước 21/09.
//  Chuẩn Reels theo developers.facebook.com/docs/video-api/guides/reels-publishing:
//  mp4 H.264, 9:16 (khuyên 1080×1920, tối thiểu 540×960), 3–90 s, 24–60 fps, closed GOP 2–5 s,
//  AAC stereo 48 kHz ≥128 kbps; API tối đa 30 Reel / 24 giờ. Ảnh bìa ≤10 MB, cùng tỉ lệ video.
//  Trả [{ ok, item, detail }] — một mục lỗi là không được đăng.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// ffmpeg / ffprobe của hệ thống (apt); FFMPEG / FFPROBE ghi đè nếu cần.
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

// Khoảng cách lớn nhất giữa hai keyframe (giây).
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

// Độ sáng trung bình (0–255) của khung đầu — khung đen làm ảnh bìa/khung chờ trong bảng tin bị đen.
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

// state: project.json; post: {description, comment}; ytStatus: {privacy} đọc thật từ YouTube (hoặc null).
function checkEpisode({ state, video, cover, post, ytStatus }) {
  const out = [];
  const add = (ok, item, detail) => out.push({ ok, item, detail });

  // --- video ---
  if (!fs.existsSync(video)) { add(false, 'Clip', `không có ${video}`); return out; }
  const p = probe(video);
  add(p.v.codec_name === 'h264', 'Mã hóa hình', p.v.codec_name);
  add(p.v.width === 1080 && p.v.height === 1920, 'Khung 9:16', `${p.v.width}×${p.v.height}`);
  add(p.dur >= 3 && p.dur <= 90, 'Thời lượng 3–90 s', `${p.dur.toFixed(1)} s`);
  add(p.fps >= 24 && p.fps <= 60, 'Khung hình/giây 24–60', p.fps.toFixed(2));
  add(p.a.codec_name === 'aac' && Number(p.a.channels) === 2 && Number(p.a.sample_rate) === 48000,
    'Âm thanh AAC stereo 48 kHz', `${p.a.codec_name} ${p.a.channels}ch ${p.a.sample_rate} Hz`);
  const gap = maxKeyframeGap(video, p.dur);
  add(gap <= 5.05, 'Keyframe ≤ 5 s (closed GOP)', `${gap.toFixed(2)} s`);
  const y = firstFrameLuma(video);
  add(y !== null && y > 24, 'Khung đầu không đen', y === null ? 'không đo được' : `độ sáng ${y.toFixed(0)}/255`);
  const src = state.videoPath && fs.existsSync(state.videoPath) ? fs.statSync(state.videoPath).mtimeMs : 0;
  add(fs.statSync(video).mtimeMs >= src, 'Clip cắt từ bản dựng mới nhất', src ? 'mới hơn video chính' : 'không thấy video chính');

  // --- ảnh bìa ---
  if (fs.existsSync(cover)) {
    const s = imageSize(cover);
    const mb = fs.statSync(cover).size / 1e6;
    add(Math.abs(s.w / s.h - 9 / 16) < 0.01 && mb <= 10, 'Ảnh bìa 9:16 ≤ 10 MB', `${s.w}×${s.h}, ${mb.toFixed(1)} MB`);
  } else add(false, 'Ảnh bìa', `không có ${path.basename(cover)}`);

  return out.concat(checkText({ state, post, ytStatus }));
}

// Phần CHỮ của một bài (Reel hoặc bài ảnh): nội dung, không link trong bài, hashtag, link đúng tập, video công khai.
function checkText({ state, post, ytStatus, full = false }) {
  const out = [];
  const add = (ok, item, detail) => out.push({ ok, item, detail });
  const d = post.description || '';
  add(d.length >= 20, 'Có nội dung bài', `${d.length} ký tự`);
  add(!/https?:\/\//i.test(d), 'Không để link trong bài', 'link đặt ở bình luận');
  const tags = d.match(/#\S+/g) || [];
  add(tags.length <= 3 && tags.every((t) => /^#[a-z0-9_]+$/.test(t)), 'Hashtag ≤ 3, không dấu', tags.join(' ') || '(không có)');
  // Đăng nguyên tập thì lời mời "nghe thử đoạn đầu" của thời cắt teaser thành sai.
  if (full) add(!/nghe thử|đoạn đầu|coi thử/i.test(d), 'Không còn lời mời kiểu teaser',
    /nghe thử|đoạn đầu|coi thử/i.test(d) ? 'bài vẫn viết như đang đăng clip cắt' : 'đã viết cho bài đăng nguyên tập');
  const m = (post.comment || '').match(YT_ID);
  add(!!m && m[1] === state.videoId, 'Link YouTube đúng tập', m ? `${m[1]} ${m[1] === state.videoId ? '=' : '≠'} ${state.videoId}` : 'bình luận không có link');
  if (ytStatus) add(ytStatus.privacy === 'public', 'Video YouTube đang công khai', ytStatus.privacy);
  else add(false, 'Video YouTube đang công khai', 'không đọc được trạng thái từ YouTube');
  return out;
}

// Bài video NGUYÊN tập trên fanpage (người dùng 21/09/2026: "không cắt nữa, đăng full",
// nhưng vẫn layout dọc như mấy bài cũ và vẫn có tên truyện ở đầu khung).
// File đăng là output/fanpage_9x16.mp4 (src/render/fanpage-video.js): 1080×1920, cả tập.
function checkFullVideo({ state, video, cover, post, ytStatus, title = '' }) {
  const out = [];
  const add = (ok, item, detail) => out.push({ ok, item, detail });

  if (!fs.existsSync(video)) { add(false, 'Video', `không có ${video}`); return out; }
  const p = probe(video);
  const mb = fs.statSync(video).size / 1e6;
  add(p.v.codec_name === 'h264', 'Mã hóa hình', p.v.codec_name);
  add(p.v.width === 1080 && p.v.height === 1920, 'Khung dọc 9:16', `${p.v.width}×${p.v.height}`);
  add(p.dur >= 60 && p.dur <= 4 * 3600, 'Thời lượng ≥ 1 phút (Facebook cho tới 4 giờ)', `${(p.dur / 60).toFixed(1)} phút`);
  add(p.fps >= 24 && p.fps <= 60, 'Khung hình/giây 24–60', p.fps.toFixed(2));
  add(p.a.codec_name === 'aac' && Number(p.a.channels) === 2 && Number(p.a.sample_rate) === 48000,
    'Âm thanh AAC stereo 48 kHz', `${p.a.codec_name} ${p.a.channels}ch ${p.a.sample_rate} Hz`);
  add(mb <= 1024, 'Dung lượng ≤ 1 GB (tải một lần)', `${mb.toFixed(0)} MB`);
  const y = firstFrameLuma(video);
  add(y !== null && y > 24, 'Khung đầu không đen', y === null ? 'không đo được' : `độ sáng ${y.toFixed(0)}/255`);
  const srcMs = state.videoPath && fs.existsSync(state.videoPath) ? fs.statSync(state.videoPath).mtimeMs : 0;
  add(!!srcMs && fs.statSync(video).mtimeMs >= srcMs, 'Dựng từ bản render mới nhất',
    srcMs ? 'mới hơn video chính' : 'không thấy video chính');
  const srcDur = srcMs ? probe(state.videoPath).dur : 0;
  add(!srcDur || Math.abs(p.dur - srcDur) <= 1.5, 'Nguyên tập, không bị cắt',
    srcDur ? `${p.dur.toFixed(0)} s / ${srcDur.toFixed(0)} s của bản dựng` : 'không đo được');
  add(!!title && !/^[a-z0-9_]+$/.test(title), 'Tên video là tiêu đề, không phải slug', title || '(trống)');

  if (fs.existsSync(cover)) {
    const s2 = imageSize(cover);
    const cmb = fs.statSync(cover).size / 1e6;
    add(Math.abs(s2.w / s2.h - 9 / 16) < 0.01 && cmb <= 10, 'Ảnh bìa 9:16 ≤ 10 MB', `${s2.w}×${s2.h}, ${cmb.toFixed(1)} MB`);
  } else add(false, 'Ảnh bìa', `không có ${path.basename(cover)}`);

  return out.concat(checkText({ state, post, ytStatus, full: true }));
}

module.exports = { checkEpisode, checkFullVideo, checkText, probe, maxKeyframeGap, firstFrameLuma };
