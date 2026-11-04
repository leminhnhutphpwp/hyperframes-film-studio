#!/usr/bin/env node
// ============================================================
//  publish/youtube/upload.js — tải MỘT project lên kênh của nó (RIÊNG TƯ), kèm thumbnail, bản dịch, playlist, phụ đề
//
//  Chạy:  node publish/youtube/upload.js <thư-mục-project> [--lang=en]            # xem trước: kiểm tra file, không gửi gì
//         node publish/youtube/upload.js <thư-mục-project> [--lang=en] --yes      # tải lên (chỉ khi chủ kênh bảo)
//  Kênh lấy theo thư mục: projects/<kênh>/<phim>[/<phần>]. Token phải thuộc đúng kênh (assertExpectedChannel).
//
//  Đọc trong <project>/publish/:
//    youtube-meta[.<lang>].json  title, description, tags, language, madeForKids, categoryId?, localizations?,
//                                playlist? (tên playlist; chưa có thì tạo RIÊNG TƯ, mô tả = playlistDescription),
//                                captions? ([{ language, file }] file .srt trong publish/ — chỉ khi chủ kênh muốn),
//                                file? (đường dẫn video, tương đối với project)
//    thumbnail[.<lang>].jpg      ảnh thumbnail (≤ 2 MB)
//  Video: meta.file, hoặc --video=<file>, hoặc file .mp4 duy nhất của ngôn ngữ đó trong <project>/out/ (hoặc bản
//  trong kho lưu trữ $STUDIO_ARCHIVE/<cùng đường dẫn> (mặc định archive/)).
//
//  Luật:
//    - luôn tải RIÊNG TƯ. Chế độ khác chỉ khi có cả --privacy=<x> VÀ --yes (chủ kênh nói rõ cho video đó)
//    - ngôn ngữ video phải là ngôn ngữ của kênh (channel.js language, mặc định vi): bản tiếng Anh để cho kênh tiếng
//      Anh riêng — --other-language để vượt (chỉ khi chủ kênh nói rõ)
//    - đã có publish/youtube[.<lang>].json là đã đăng → bỏ qua, không tải lại
//  Ghi: <project>/publish/youtube[.<lang>].json { videoId, title, url, status, uploadedAt }
//       channels/<kênh>/published/<videoId>.json { videoId, title, url, privacy, uploadedAt, project, language }
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const { args, openYouTube, publishedPath, writeJson, isScopeError, fail } = require('../lib/cli');

const PRIVACY = ['private', 'unlisted', 'public'];

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Cách dùng: node publish/youtube/upload.js <thư-mục-project> [--lang=en] [--yes]');
  const project = studio.projectDir(target);
  const ch = studio.channel({ project });
  const { lang, sfx } = studio.langOf();
  const pub = path.join(project, 'publish');
  const metaFile = studio.metaFile(project, lang);
  const record = studio.uploadRecord(project, lang);

  if (fs.existsSync(record)) {
    const r = studio.readJson(record);
    console.log(`⏭  ${studio.rel(project)} (${lang}) đã đăng: ${r.url || r.videoId} (${r.status || '?'}) — không tải lại.`);
    return;
  }
  const meta = studio.readJson(metaFile);
  if (!meta) throw new Error(`Chưa có ${studio.rel(metaFile)}.`);

  // ---------- kiểm tra ----------
  const problems = [];
  const notes = [];
  const title = String(meta.title || '').trim();
  if (!title) problems.push('meta thiếu title');
  if (title.length > 100) problems.push(`title ${title.length} ký tự (> 100)`);
  if (!meta.description) problems.push('meta thiếu description');
  if ((meta.description || '').length > 5000) problems.push(`description ${meta.description.length} ký tự (> 5000)`);
  if (/[<>]/.test(title + (meta.description || ''))) problems.push('title/description có ký tự < hoặc > (YouTube từ chối)');
  const tagLen = (meta.tags || []).join(',').length;
  if (tagLen > 500) problems.push(`tags dài ${tagLen} ký tự (> 500)`);

  const vidLang = meta.language || lang;
  const chLang = ch.config.language || 'vi';
  if (vidLang !== chLang && !a.has('other-language')) {
    problems.push(`video tiếng "${vidLang}" nhưng kênh ${ch.id} là tiếng "${chLang}" — bản này để cho kênh khác (--other-language chỉ khi chủ kênh nói rõ)`);
  }

  let privacy = 'private';
  if (a.flags.privacy !== undefined) {
    if (!PRIVACY.includes(a.flags.privacy)) problems.push(`--privacy phải là ${PRIVACY.join('|')}`);
    else privacy = a.flags.privacy;
  }
  if (meta.privacyStatus && meta.privacyStatus !== 'private' && meta.privacyStatus !== privacy) {
    notes.push(`meta ghi privacyStatus "${meta.privacyStatus}" — bỏ qua, tải ${privacy}`);
  }

  let video = null;
  try {
    if (typeof a.flags.video === 'string') video = path.resolve(a.flags.video);
    else if (meta.file) video = studio.findMedia(path.join(project, meta.file)) || path.join(project, meta.file);
    else video = studio.findProjectVideo(project, lang);
  } catch (e) { problems.push(e.message); }
  if (!video) problems.push(`không thấy video${sfx ? ` (*${sfx}.mp4)` : ''} trong ${studio.rel(path.join(project, 'out'))} hay kho lưu trữ`);
  else if (!fs.existsSync(video)) problems.push(`không có ${video}`);

  const thumb = path.join(pub, `thumbnail${sfx}.jpg`);
  if (!fs.existsSync(thumb)) notes.push(`không có ${studio.rel(thumb)} — bỏ qua thumbnail`);
  else if (fs.statSync(thumb).size > 2 * 1024 * 1024) problems.push(`${path.basename(thumb)} lớn hơn 2 MB`);

  const loc = meta.localizations || {};
  for (const [l, v] of Object.entries(loc)) {
    if (!v.title || !v.description) problems.push(`localizations.${l} thiếu title hoặc description`);
    else if (v.title.length > 100) problems.push(`localizations.${l}.title > 100 ký tự`);
  }

  const caps = (Array.isArray(meta.captions) ? meta.captions : []).map((c) => ({
    language: c.language || vidLang, file: path.join(pub, c.file), name: c.name || '',
  }));
  for (const c of caps) if (!fs.existsSync(c.file)) problems.push(`không có file phụ đề ${studio.rel(c.file)}`);

  // ---------- in ra ----------
  console.log(`Kênh: ${ch.config.name} (${ch.id}) · project ${studio.rel(project)} · ngôn ngữ ${lang}`);
  console.log(`  video:      ${video ? `${video}${fs.existsSync(video) ? ` (${(fs.statSync(video).size / 1048576).toFixed(1)} MB)` : ''}` : '(không thấy)'}`);
  console.log(`  tiêu đề:    ${title}`);
  console.log(`  chế độ:     ${privacy}${privacy !== 'private' ? '  ⚠️  KHÔNG riêng tư' : ''}`);
  console.log(`  danh mục:   ${meta.categoryId || ch.config.defaultCategoryId || '24'} · ${(meta.tags || []).length} tag · madeForKids ${!!meta.madeForKids}`);
  console.log(`  thumbnail:  ${fs.existsSync(thumb) ? studio.rel(thumb) : '(không)'}`);
  console.log(`  bản dịch:   ${Object.keys(loc).join(', ') || '(không)'}`);
  console.log(`  playlist:   ${meta.playlist || '(không)'}`);
  console.log(`  phụ đề:     ${caps.map((c) => `${c.language} ${path.basename(c.file)}`).join(', ') || '(không)'}`);
  for (const n of notes) console.log(`  · ${n}`);
  if (problems.length) {
    for (const p of problems) console.log(`  ✗ ${p}`);
    throw new Error(`${problems.length} mục chưa đạt — sửa rồi chạy lại, chưa gửi gì.`);
  }

  if (!yes) {
    // Xem trước: chỉ đọc — token đúng kênh không, playlist đã có chưa.
    try {
      const yt = await openYouTube(ch);
      console.log(`  ✓ token thuộc kênh ${yt.channel.snippet.title} (${yt.channel.id})`);
      if (meta.playlist) {
        const pl = await yt.findPlaylistByTitle(meta.playlist);
        console.log(`  ${pl ? `✓ playlist đã có (${pl.playlistId})` : '· playlist chưa có — sẽ tạo RIÊNG TƯ'}`);
      }
    } catch (e) { console.log(`  ✗ YouTube: ${e.message}`); }
    console.log('\n(Xem trước — chưa tải gì. Chủ kênh bảo đăng thì chạy lại với --yes.)');
    return;
  }

  // ---------- tải lên ----------
  const yt = await openYouTube(ch);
  console.log(`\nKênh: ${yt.channel.snippet.title} (${yt.channel.id})`);
  const r = await yt.uploadVideo(video, {
    ...meta, title, privacyStatus: privacy, language: vidLang,
    categoryId: meta.categoryId || ch.config.defaultCategoryId || '24',
  });
  // Ghi dấu NGAY để lần chạy sau không tải trùng, dù bước sau có lỗi.
  writeJson(record, { videoId: r.videoId, title: r.title, url: r.url, status: r.status, uploadedAt: r.uploadedAt });
  writeJson(publishedPath(ch, r.videoId), {
    videoId: r.videoId, title: r.title, url: r.url, privacy: r.status, uploadedAt: r.uploadedAt,
    project: path.relative(studio.ROOT, project), language: vidLang,
  });
  console.log(`✅ Đã tải ${r.url} (${r.status}) — ghi ${studio.rel(record)}`);

  const warn = [];
  if (fs.existsSync(thumb)) {
    try { await yt.setThumbnail(r.videoId, thumb); console.log('✅ thumbnail'); } catch (e) { warn.push(`thumbnail: ${e.message}`); }
  }
  if (Object.keys(loc).length) {
    try {
      const v = (await yt.youtube.videos.list({ part: ['snippet'], id: [r.videoId] })).data.items[0].snippet;
      await yt.youtube.videos.update({
        part: ['snippet', 'localizations'],
        requestBody: {
          id: r.videoId,
          snippet: { title: v.title, description: v.description, tags: v.tags, categoryId: v.categoryId,
            defaultLanguage: vidLang, defaultAudioLanguage: v.defaultAudioLanguage || vidLang },
          localizations: loc,
        },
      });
      console.log(`✅ bản dịch: ${Object.keys(loc).join(', ')}`);
    } catch (e) { warn.push(`bản dịch: ${e.message} (chạy lại: node publish/youtube/localize.js ${studio.rel(project)}${sfx ? ` --lang=${lang}` : ''} --yes)`); }
  }
  if (meta.playlist) {
    try {
      let pl = await yt.findPlaylistByTitle(meta.playlist);
      if (!pl) {
        const res = await yt.youtube.playlists.insert({
          part: ['snippet', 'status'],
          requestBody: { snippet: { title: meta.playlist, description: meta.playlistDescription || '', defaultLanguage: vidLang },
            status: { privacyStatus: 'private' } },
        });
        pl = { playlistId: res.data.id, title: meta.playlist };
        console.log(`✅ tạo playlist riêng tư "${meta.playlist}" (${pl.playlistId})`);
        await new Promise((ok) => setTimeout(ok, 15000)); // playlist mới: playlistItems chưa thấy trong vài giây
      }
      if (!(await yt.isVideoInPlaylist(pl.playlistId, r.videoId))) await yt.addVideoToPlaylist(pl.playlistId, r.videoId);
      console.log(`✅ trong playlist "${meta.playlist}"`);
    } catch (e) { warn.push(`playlist: ${e.message}`); }
  }
  for (const c of caps) {
    try {
      const res = await yt.youtube.captions.insert({
        part: ['snippet'],
        requestBody: { snippet: { videoId: r.videoId, language: c.language, name: c.name, isDraft: false } },
        media: { mimeType: 'application/octet-stream', body: fs.createReadStream(c.file) },
      });
      console.log(`✅ phụ đề ${c.language} (${res.data.id})`);
    } catch (e) {
      warn.push(`phụ đề ${c.language}: ${isScopeError(e) ? `token thiếu quyền youtube.force-ssl — chủ kênh chạy publish/youtube/auth.js --channel=${ch.id}` : e.message}`);
    }
  }
  for (const w of warn) console.log(`⚠️  ${w}`);
  console.log(`\nVideo đang ${r.status}. Công khai / lên lịch / màn hình kết thúc: chủ kênh làm trong Studio.`);
}

main().catch(fail);
