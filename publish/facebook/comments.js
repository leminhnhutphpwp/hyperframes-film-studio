#!/usr/bin/env node
// ============================================================
//  publish/facebook/comments.js — bình luận của người xem trên fanpage mà trang CHƯA trả lời + gửi trả lời đã duyệt
//
//  Chạy:  node publish/facebook/comments.js --channel=<kênh>                                    # liệt kê (chỉ đọc)
//         node publish/facebook/comments.js --channel=<kênh> --reply <commentId> "<lời trả lời>"         # xem trước
//         node publish/facebook/comments.js --channel=<kênh> --reply <commentId> "<lời trả lời>" --yes   # gửi MỘT câu đã duyệt
//
//  Trả lời là gửi tin thay mặt kênh -> agent soạn, CHỦ KÊNH DUYỆT từng câu rồi mới --yes (không tự gửi hàng loạt).
//  Giọng: xưng "mình", gọi "bạn/các bạn", ấm, ngắn, đúng nội dung người ta viết; không dán link (trừ khi họ hỏi link
//  xem trọn chuyện — link đã có ở bình luận đầu). Không tự bình luận rồi tự trả lời để "đủ số" nhiệm vụ.
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
    if (typeof id !== 'string' || !text) throw new Error('Cần: --reply <commentId> "<lời trả lời>"');
    const list = await FB.unansweredComments(tok.pageId, tok.access_token);
    const c = list.find((x) => x.commentId === id);
    if (!c) throw new Error(`Không thấy bình luận ${id} trong danh sách chưa trả lời (đã trả lời rồi, hoặc sai id)`);
    console.log(`↩️  ${c.from}: "${c.message}"\n   Trả lời: "${text}"`);
    if (!a.has('yes')) { console.log('(Xem trước — thêm --yes để gửi, sau khi chủ kênh duyệt)'); return; }
    const r = await FB.comment(id, tok.access_token, text);
    console.log(`✅ Đã trả lời (${r.id})`);
    return;
  }
  const list = await FB.unansweredComments(tok.pageId, tok.access_token);
  console.log(`Trang: ${tok.pageName} (${tok.pageId})`);
  if (!list.length) { console.log('Không có bình luận nào của người xem đang chờ trả lời.'); return; }
  console.log(`💬 ${list.length} bình luận chờ trả lời:`);
  for (const c of list) console.log(`\n• [${c.commentId}] ${c.from} (${c.createdTime.slice(0, 16).replace('T', ' ')}): ${c.message}\n  trên bài: ${c.postText} — ${c.postUrl}`);
}

main().catch(fail);
