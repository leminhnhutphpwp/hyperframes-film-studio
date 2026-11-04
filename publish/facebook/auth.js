#!/usr/bin/env node
// ============================================================
//  publish/facebook/auth.js — lấy token TRANG Facebook (không hết hạn) cho fanpage của một kênh
//
//  Cần trong .env (gốc studio): FB_APP_ID, FB_APP_SECRET, FB_USER_TOKEN (token người dùng ngắn hạn tạo ở
//  Graph API Explorer, có quyền pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement).
//  Các bước: tạo app ở developers.facebook.com, lấy token người dùng ở Graph API Explorer với quyền quản lý trang.
//
//  Chạy:  node publish/facebook/auth.js --channel=<kênh>
//    1) đổi FB_USER_TOKEN sang token người dùng dài hạn (~60 ngày);
//    2) lấy token của trang trong channels/<kênh>/channel.js facebook.pageId — token trang lấy từ token
//       dài hạn thì không hết hạn;
//    3) lưu secrets/<kênh>/facebook-token.json (git bỏ qua); token cũ sao lưu vào secrets/<kênh>/old-tokens/.
//  Không in token ra màn hình. Xong thì xóa FB_USER_TOKEN khỏi .env.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const studio = require('../lib/studio');
const FB = require('../lib/facebook');
const { fail } = require('../lib/cli');

async function main() {
  const ch = studio.channel();
  const pageId = FB.pageIdOf(ch);
  const { FB_APP_ID: appId, FB_APP_SECRET: secret, FB_USER_TOKEN: shortToken } = process.env;
  const missing = [['FB_APP_ID', appId], ['FB_APP_SECRET', secret], ['FB_USER_TOKEN', shortToken]].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Thiếu trong .env: ${missing.join(', ')} — xem channels/${ch.id}/docs/FACEBOOK.md`);

  const long = await FB.get('oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: shortToken,
  });
  const me = await FB.get('me', { fields: 'id,name', access_token: long.access_token });
  const pages = await FB.get('me/accounts', { fields: 'id,name,access_token,tasks', limit: 100, access_token: long.access_token });
  const page = (pages.data || []).find((p) => String(p.id) === pageId);
  if (!page) {
    const names = (pages.data || []).map((p) => `${p.name} (${p.id})`).join(', ') || 'không có trang nào';
    throw new Error(`Token của ${me.name} không quản lý trang ${pageId}. Trang thấy được: ${names}. `
      + `Khi tạo token ở Graph API Explorer, nhớ chọn trang của kênh ${ch.config.name}.`);
  }
  const info = await FB.get('debug_token', { input_token: page.access_token, access_token: `${appId}|${secret}` });
  const d = info.data || {};
  const scopes = d.scopes || [];
  const need = ['pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement'];
  const lacking = need.filter((s) => !scopes.includes(s));

  const file = FB.tokenPath(ch);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    const dir = path.join(ch.secrets, 'old-tokens');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const backup = path.join(dir, `facebook-token.backup-${Date.now()}.json`);
    fs.copyFileSync(file, backup);
    console.log(`Token cũ đã sao lưu: ${studio.rel(backup)}`);
  }
  fs.writeFileSync(file, JSON.stringify({
    pageId: page.id, pageName: page.name, access_token: page.access_token,
    user: me.name, scopes, expiresAt: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'never',
    savedAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 });

  console.log(`✅ Đã lưu token trang "${page.name}" (${page.id}) vào ${studio.rel(file)}`);
  console.log(`   Hết hạn: ${d.expires_at ? new Date(d.expires_at * 1000).toLocaleString('vi-VN') : 'không hết hạn'}`);
  if (lacking.length) console.log(`⚠️  Token thiếu quyền: ${lacking.join(', ')} — tạo lại FB_USER_TOKEN có đủ quyền rồi chạy lại.`);
  console.log('   Giờ có thể xóa FB_USER_TOKEN khỏi .env.');
}

main().catch(fail);
