#!/usr/bin/env node
// ============================================================
//  publish/youtube/set-title.js — đổi TIÊU ĐỀ của video ĐÃ TẢI LÊN cho khớp publish/youtube-meta[.<lang>].json
//
//  Chạy:  node publish/youtube/set-title.js <thư-mục-project> [--lang=en] --yes
//    - KHÔNG có --yes thì chỉ in ra tiêu đề cũ -> mới, không đổi gì (video đã đăng là của chủ kênh: chỉ chạy khi chủ
//      kênh nói rõ cho video đó)
//    - chỉ đổi snippet.title; mô tả, tag, danh mục, ngôn ngữ đọc lại từ YouTube và gửi y nguyên (videos.update với
//      part snippet GHI ĐÈ cả snippet — thiếu trường nào là trường đó bị xoá)
//    - chỉ chạy với token của đúng kênh; video phải thuộc kênh
//    - tốn ~51 đơn vị hạn mức (videos.list 1 + videos.update 50)
// ============================================================

'use strict';

const studio = require('../lib/studio');
const { args, openYouTube, saveRecords, fail } = require('../lib/cli');

async function main() {
  const a = args();
  const yes = a.has('yes');
  const target = a.pos[0];
  if (!target) throw new Error('Dùng: set-title.js <thư-mục-project> [--lang=en] --yes');
  const { lang } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Cần thư mục project (tiêu đề mới lấy từ publish/youtube-meta*.json).');
  const metaFile = studio.metaFile(project, lang);
  const title = String((studio.readJson(metaFile) || {}).title || '').trim();
  if (!title) throw new Error(`Không có tiêu đề trong ${studio.rel(metaFile)}.`);
  if (title.length > 100) throw new Error(`Tiêu đề ${title.length} ký tự (> 100, YouTube từ chối).`);

  const yt = await openYouTube(ch);
  const res = await yt.youtube.videos.list({ part: ['snippet'], id: [videoId] });
  const v = (res.data.items || [])[0];
  if (!v) throw new Error(`Không tìm thấy video ${videoId} trên kênh.`);
  if (v.snippet.channelId !== yt.channel.id) throw new Error(`Video ${videoId} không thuộc kênh ${yt.channel.id}.`);
  const s = v.snippet;
  console.log(`Video ${videoId}: "${s.title}" -> "${title}"`);
  if (s.title === title) { console.log('Không cần đổi.'); return; }
  if (!yes) { console.log('Chưa đổi gì (thiếu --yes).'); return; }

  await yt.youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: videoId,
      snippet: {
        title,
        description: s.description,
        tags: s.tags,
        categoryId: s.categoryId,
        defaultLanguage: s.defaultLanguage,
        defaultAudioLanguage: s.defaultAudioLanguage,
      },
    },
  });
  const after = (await yt.youtube.videos.list({ part: ['snippet'], id: [videoId] })).data.items[0].snippet;
  if (after.title !== title) throw new Error(`YouTube vẫn trả về "${after.title}".`);
  if (after.description !== s.description || (after.tags || []).length !== (s.tags || []).length) {
    throw new Error('Mô tả hoặc tag đổi khác sau khi cập nhật — kiểm tra trong Studio.');
  }
  saveRecords({ ch, project, lang, videoId, projectPatch: { title }, channelPatch: { title } });
  console.log(`✅ ${videoId}: "${after.title}" (mô tả, ${(after.tags || []).length} tag giữ nguyên)`);
}

main().catch(fail);
