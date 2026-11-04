#!/usr/bin/env node
// ============================================================
//  publish/youtube/auth.js — đăng nhập YouTube (OAuth) cho MỘT kênh của studio
//
//  Chạy:  node publish/youtube/auth.js --channel=<kênh>
//    1) mở link in ra trên trình duyệt của MÁY NÀY, đăng nhập và chọn đúng kênh;
//    2) Google chuyển về http://localhost:<port> — script tự nhận mã;
//    3) hỏi YouTube token mới thuộc kênh nào: ĐÚNG channelId trong channels/<kênh>/channel.js mới lưu
//       secrets/<kênh>/youtube-token.json; token cũ được sao lưu vào secrets/<kênh>/old-tokens/.
//       Sai kênh -> KHÔNG lưu (thêm --force nếu thật sự muốn kênh khác).
//  Không in token ra màn hình. Việc của chủ kênh — agent không tự chạy.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const studio = require('../lib/studio');
const { google } = require('../lib/google');
const { SCOPES, CREDENTIALS_PATH, tokenPath } = require('../lib/youtube');
const { fail } = require('../lib/cli');

const PORT = Number(process.env.YOUTUBE_AUTH_PORT || 53682);

function waitForCode(authUrl, redirectUri) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, redirectUri);
      const code = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      if (!code && !err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(err ? `<h2>Đăng nhập lỗi: ${err}</h2>` : '<h2>Đã nhận mã đăng nhập — quay lại terminal.</h2>');
      server.close();
      if (err) reject(new Error(`Google trả lỗi OAuth: ${err}`));
      else resolve(code);
    });
    server.on('error', reject);
    server.listen(PORT, 'localhost', () => {
      console.log('1) Mở link sau trên trình duyệt của máy này, đăng nhập và CHỌN KÊNH cần đăng video:\n');
      console.log(`${authUrl}\n`);
      console.log(`2) Đang chờ Google chuyển về ${redirectUri} ...`);
    });
  });
}

async function main() {
  const ch = studio.channel();
  const expected = ch.config.channelId;
  const force = process.argv.includes('--force');
  // a new channel without a channelId yet: the first login is accepted only if the channel's name matches, and its
  // id is then written into channel.js
  const firstLogin = !expected;
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error(`Thiếu ${studio.rel(CREDENTIALS_PATH)} (OAuth client của Google Cloud).`);
  const cred = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = cred.installed || cred.web || {};
  if (!client_id || !client_secret) throw new Error('google-oauth-client.json không có client_id/client_secret.');

  console.log(`Kênh cần đăng nhập: ${ch.config.name} (${expected || 'chưa có channelId'})\n`);
  const redirectUri = `http://localhost:${PORT}`;
  const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  // prompt consent: luôn trả refresh_token; select_account: cho chọn tài khoản / kênh thương hiệu.
  const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent select_account', scope: SCOPES });
  const code = await waitForCode(authUrl, redirectUri);

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const yt = google.youtube({ version: 'v3', auth: client });
  const r = await yt.channels.list({ part: 'snippet', mine: true });
  const got = r.data.items && r.data.items[0];
  if (!got) throw new Error('Tài khoản vừa đăng nhập không có kênh YouTube nào.');
  console.log(`\nToken mới thuộc kênh: "${got.snippet.title}" (${got.id})`);

  if (firstLogin) {
    if (got.snippet.title.trim() !== String(ch.config.name).trim() && !force) {
      throw new Error(`Kênh vừa chọn là "${got.snippet.title}", không phải "${ch.config.name}" — chưa lưu. Chạy lại và chọn đúng kênh.`);
    }
    const cfgFile = path.join(ch.dir, 'channel.js');
    const txt = fs.readFileSync(cfgFile, 'utf8').replace(/channelId: null,[^\n]*/, `channelId: '${got.id}',`)
      .replace(/url: null,/, `url: 'https://www.youtube.com/channel/${got.id}',`);
    fs.writeFileSync(cfgFile, txt);
    console.log(`channelId ${got.id} ghi vào ${studio.rel(cfgFile)}`);
  } else if (got.id !== expected && !force) {
    throw new Error(`Đây KHÔNG phải kênh ${ch.id} (${expected}) — chưa lưu token. `
      + 'Chạy lại và chọn đúng kênh ở bước đăng nhập (hoặc thêm --force nếu thật sự muốn kênh này).');
  }
  if (!tokens.refresh_token) {
    console.log('⚠️  Google không trả refresh_token → token chỉ dùng được ~1 giờ. '
      + 'Gỡ quyền của app ở https://myaccount.google.com/permissions rồi chạy lại.');
  }
  const file = tokenPath(ch);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    const dir = path.join(ch.secrets, 'old-tokens');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const backup = path.join(dir, `youtube-token.backup-${Date.now()}.json`);
    fs.copyFileSync(file, backup);
    console.log(`Token cũ đã sao lưu: ${studio.rel(backup)}`);
  }
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log(`✅ Đã lưu ${studio.rel(file)} cho kênh "${got.snippet.title}".`);
}

main().catch(fail);
