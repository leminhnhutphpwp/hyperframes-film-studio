#!/usr/bin/env node
// ============================================================
//  publish/youtube/captions.js — tải track phụ đề (.srt) lên video đã đăng, mỗi ngôn ngữ một track
//
//  Chạy:  node publish/youtube/captions.js <thư-mục-project> [--lang=en] [--langs vi,en] [--file x.srt] [--replace] [--merge] --yes
//    - LUẬT STUDIO: bản lồng tiếng (VI hay EN) KHÔNG kèm phụ đề — chỉ chạy khi chủ kênh nói rõ cho video đó
//    - file cho mỗi ngôn ngữ L (cái đầu tiên có): publish/phu-de.L.srt, publish/captions.L.srt, out/phu-de.L.srt,
//      out/captions.L.srt (out/ cũng tìm trong kho lưu trữ); --file chỉ dùng với MỘT ngôn ngữ
//    - ngôn ngữ: --langs, không thì `captions` trong youtube-meta*.json ([{ language, file }]), không thì mọi L có file
//    - phụ đề TẢI RIÊNG (người xem tự bật/tắt), KHÔNG đốt vào hình
//    - ngôn ngữ đã có track (không phải auto) thì bỏ qua; --replace để thay
//    - --merge: xoá track của mình rồi tải lại KHÔNG đặt tên -> Studio gộp vào hàng ngôn ngữ chung. Không đụng asr.
//    - KHÔNG có --yes thì chỉ in ra việc sẽ làm
//    - cần quyền youtube.force-ssl: token thiếu -> chủ kênh chạy lại node publish/youtube/auth.js --channel=<kênh>
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const { args, openYouTube, isScopeError, fail } = require('../lib/cli');

const LANG_NAMES = { vi: 'Tiếng Việt', en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', ja: '日本語', ko: '한국어', zh: '中文' };

function captionFile(project, lang) {
  const cands = [
    path.join(project, 'publish', `phu-de.${lang}.srt`),
    path.join(project, 'publish', `captions.${lang}.srt`),
    path.join(project, 'out', `phu-de.${lang}.srt`),
    path.join(project, 'out', `captions.${lang}.srt`),
  ];
  for (const c of cands) { const f = studio.findMedia(c); if (f) return f; }
  return null;
}

function langsWithFiles(project) {
  const out = new Set();
  for (const d of ['publish', 'out']) {
    const dir = path.join(project, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) { const m = f.match(/^(?:phu-de|captions)\.([a-z]{2})\.srt$/); if (m) out.add(m[1]); }
  }
  return [...out];
}

async function main() {
  const a = args();
  const yes = a.has('yes');
  const replace = a.has('replace');
  const merge = a.has('merge');
  const target = a.pos[0];
  if (!target) throw new Error('Cách dùng: node publish/youtube/captions.js <thư-mục-project> [--lang=en] [--langs vi,en] [--replace] [--merge] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Cần thư mục project (file .srt nằm trong project).');
  const meta = studio.readJson(studio.metaFile(project, lang)) || {};

  let tracks;
  if (typeof a.flags.langs === 'string') {
    const langs = a.flags.langs.split(',').map((x) => x.trim()).filter(Boolean);
    if (typeof a.flags.file === 'string' && langs.length !== 1) throw new Error('--file chỉ dùng với đúng một ngôn ngữ trong --langs.');
    tracks = langs.map((l) => ({ lang: l, file: typeof a.flags.file === 'string' ? path.resolve(a.flags.file) : captionFile(project, l) }));
  } else if (Array.isArray(meta.captions) && meta.captions.length) {
    tracks = meta.captions.map((c) => ({ lang: c.language || meta.language || lang, file: studio.findMedia(path.join(project, 'publish', c.file)) || path.join(project, 'publish', c.file) }));
  } else {
    tracks = langsWithFiles(project).map((l) => ({ lang: l, file: captionFile(project, l) }));
  }
  if (!tracks.length) throw new Error(`Không thấy file phụ đề nào trong ${studio.rel(project)}/publish hay out/ — truyền --langs/--file.`);
  const missing = tracks.filter((t) => !t.file || !fs.existsSync(t.file));
  if (missing.length) throw new Error(`Chưa có file phụ đề cho: ${missing.map((t) => t.lang).join(', ')}`);

  const yt = await openYouTube(ch);
  const api = yt.youtube;
  const v = ((await api.videos.list({ part: ['snippet'], id: [videoId] })).data.items || [])[0];
  if (!v) throw new Error(`Không thấy video ${videoId} trên kênh.`);
  if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} không thuộc kênh ${yt.channel.id}.`);
  console.log(`Video ${videoId} "${v.snippet.title}"`);

  try {
    const list = await api.captions.list({ part: ['snippet'], videoId });
    for (const { lang: l, file } of tracks) {
      const name = merge ? '' : (LANG_NAMES[l] || l);
      let existing = (list.data.items || []).find((c) => c.snippet.language === l && c.snippet.trackKind !== 'asr');
      const what = existing
        ? (merge ? `xoá "${existing.snippet.name}" rồi tải lại không tên` : replace ? 'thay track đang có' : `bỏ qua (đã có "${existing.snippet.name}", --replace để thay)`)
        : `tải track ${name ? `"${name}"` : 'không tên'}`;
      console.log(`  ${l}: ${studio.rel(file)} → ${what}`);
      if (!yes) continue;
      if (merge && existing) {
        await api.captions.delete({ id: existing.id });
        console.log(`🗑  Đã xoá phụ đề "${existing.snippet.name}" (${l}) của ${videoId} để tải lại không tên`);
        existing = null;
      }
      const media = { mimeType: 'application/octet-stream', body: fs.createReadStream(file) };
      if (existing) {
        if (!replace) continue;
        await api.captions.update({ part: ['snippet'], requestBody: { id: existing.id, snippet: { isDraft: false } }, media });
        console.log(`✅ Đã thay phụ đề ${l} của ${videoId}`);
        continue;
      }
      const res = await api.captions.insert({
        part: ['snippet'],
        requestBody: { snippet: { videoId, language: l, name, isDraft: false } },
        media,
      });
      console.log(`✅ Đã tải phụ đề ${name ? `"${name}" ` : 'không tên '}(${l}) lên ${videoId} (caption ${res.data.id})`);
    }
    if (!yes) console.log('Chưa tải gì (thiếu --yes).');
  } catch (e) {
    if (isScopeError(e)) {
      throw new Error(`Token chưa có quyền phụ đề (youtube.force-ssl). Chủ kênh đăng nhập lại: node publish/youtube/auth.js --channel=${ch.id}`);
    }
    throw e;
  }
}

main().catch(fail);
