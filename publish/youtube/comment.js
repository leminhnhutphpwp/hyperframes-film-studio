#!/usr/bin/env node
// ============================================================
//  publish/youtube/comment.js — đăng bình luận ĐẦU của kênh lên video đã công khai
//
//  Chạy:  node publish/youtube/comment.js <thư-mục-project> [--lang=en] [--yes] [--force]
//    - nội dung: <project>/publish/comment[.<lang>].txt (agent soạn, chủ kênh duyệt)
//    - KHÔNG có --yes thì chỉ in ra xem trước, không đăng
//    - video còn riêng tư thì YouTube từ chối ("has disabled comments") — công khai rồi mới đăng được
//    - đã có bình luận của kênh trên video đó thì bỏ qua (--force để đăng thêm)
//    - KHÔNG chèn link vào bình luận (luật kênh); link đăng ký nằm ở mô tả
//    - GHIM là việc của chủ kênh: API YouTube không ghim được bình luận
//    - chỉ chạy với token của đúng kênh; cần quyền youtube.force-ssl
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
  if (!target) throw new Error('Cách dùng: node publish/youtube/comment.js <thư-mục-project> [--lang=en] [--yes] [--force]');
  const { lang, sfx } = studio.langOf();
  const { videoId, project, channel: ch } = studio.resolveVideo(target, { lang });
  if (!project) throw new Error('Cần thư mục project (bình luận lấy từ publish/comment*.txt).');

  const file = path.join(project, 'publish', `comment${sfx}.txt`);
  if (!fs.existsSync(file)) throw new Error(`Chưa có ${studio.rel(file)} — soạn bình luận đầu (chủ kênh duyệt) rồi chạy lại.`);
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) throw new Error(`${studio.rel(file)} rỗng.`);
  if (LINK_RE.test(text)) throw new Error(`${path.basename(file)} có link — luật kênh: bình luận không chèn link (link đăng ký để ở mô tả).`);

  console.log(`💬 ${studio.rel(project)} → https://www.youtube.com/watch?v=${videoId}\n${'─'.repeat(60)}\n${text}\n${'─'.repeat(60)}`);
  if (!yes) { console.log('(xem trước — thêm --yes để đăng thật)'); return; }

  const yt = await openYouTube(ch);
  const api = yt.youtube;
  try {
    if (!force) {
      const mine = await api.commentThreads.list({ part: ['snippet'], videoId, maxResults: 50, textFormat: 'plainText' });
      const own = (mine.data.items || []).find((t) => t.snippet.topLevelComment.snippet.authorChannelId
        && t.snippet.topLevelComment.snippet.authorChannelId.value === yt.channel.id);
      if (own) { console.log(`⏭  Kênh đã có bình luận trên ${videoId} — thêm --force nếu thật sự muốn đăng thêm.`); return; }
    }
    const res = await api.commentThreads.insert({
      part: ['snippet'],
      requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } },
    });
    console.log(`✅ Đã đăng bình luận đầu lên ${videoId} (${res.data.id})`);
    console.log('   Ghim giúp nhé — API YouTube không ghim bình luận được.');
  } catch (e) {
    if (isScopeError(e)) throw new Error(`Token chưa có quyền bình luận (youtube.force-ssl). Chủ kênh đăng nhập lại: node publish/youtube/auth.js --channel=${ch.id}`);
    if (/disabled comments/i.test(String(e.message))) throw new Error(`${videoId} đang tắt bình luận — video còn riêng tư thì YouTube chặn; công khai rồi chạy lại.`);
    throw e;
  }
}

main().catch(fail);
