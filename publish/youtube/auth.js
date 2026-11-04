#!/usr/bin/env node
// ============================================================
//  publish/youtube/auth.js — YouTube sign-in (OAuth) for ONE studio channel
//
//  Run:  node publish/youtube/auth.js --channel=<channel>
//    1) open the printed link in a browser on THIS MACHINE, sign in and pick the right channel;
//    2) Google redirects to http://localhost:<port> — the script picks up the code;
//    3) asks YouTube which channel the new token belongs to: only if it MATCHES channelId in channels/<channel>/channel.js is
//       secrets/<channel>/youtube-token.json saved; the old token is backed up to secrets/<channel>/old-tokens/.
//       Wrong channel -> NOT saved (add --force if you really want a different channel).
//  Never prints the token. The channel owner runs this — the agent does not run it on its own.
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
      res.end(err ? `<h2>Sign-in error: ${err}</h2>` : '<h2>Sign-in code received — return to the terminal.</h2>');
      server.close();
      if (err) reject(new Error(`Google returned an OAuth error: ${err}`));
      else resolve(code);
    });
    server.on('error', reject);
    server.listen(PORT, 'localhost', () => {
      console.log('1) Open this link in a browser on this machine, sign in and PICK THE CHANNEL to upload to:\n');
      console.log(`${authUrl}\n`);
      console.log(`2) Waiting for Google to redirect to ${redirectUri} ...`);
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
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error(`Missing ${studio.rel(CREDENTIALS_PATH)} (Google Cloud OAuth client).`);
  const cred = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = cred.installed || cred.web || {};
  if (!client_id || !client_secret) throw new Error('google-oauth-client.json has no client_id/client_secret.');

  console.log(`Channel to sign in: ${ch.config.name} (${expected || 'no channelId yet'})\n`);
  const redirectUri = `http://localhost:${PORT}`;
  const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  // prompt consent: always returns a refresh_token; select_account: lets you pick an account / brand channel.
  const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent select_account', scope: SCOPES });
  const code = await waitForCode(authUrl, redirectUri);

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const yt = google.youtube({ version: 'v3', auth: client });
  const r = await yt.channels.list({ part: 'snippet', mine: true });
  const got = r.data.items && r.data.items[0];
  if (!got) throw new Error('The signed-in account has no YouTube channel.');
  console.log(`\nNew token belongs to channel: "${got.snippet.title}" (${got.id})`);

  if (firstLogin) {
    if (got.snippet.title.trim() !== String(ch.config.name).trim() && !force) {
      throw new Error(`The selected channel is "${got.snippet.title}", not "${ch.config.name}" — not saved. Run again and pick the right channel.`);
    }
    const cfgFile = path.join(ch.dir, 'channel.js');
    const txt = fs.readFileSync(cfgFile, 'utf8').replace(/channelId: null,[^\n]*/, `channelId: '${got.id}',`)
      .replace(/url: null,/, `url: 'https://www.youtube.com/channel/${got.id}',`);
    fs.writeFileSync(cfgFile, txt);
    console.log(`channelId ${got.id} written to ${studio.rel(cfgFile)}`);
  } else if (got.id !== expected && !force) {
    throw new Error(`This is NOT channel ${ch.id} (${expected}) — token not saved. `
      + 'Run again and pick the right channel at sign-in (or add --force if you really want this channel).');
  }
  if (!tokens.refresh_token) {
    console.log('⚠️  Google did not return a refresh_token → the token only works for ~1 hour. '
      + 'Revoke the app at https://myaccount.google.com/permissions and run again.');
  }
  const file = tokenPath(ch);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    const dir = path.join(ch.secrets, 'old-tokens');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const backup = path.join(dir, `youtube-token.backup-${Date.now()}.json`);
    fs.copyFileSync(file, backup);
    console.log(`Old token backed up: ${studio.rel(backup)}`);
  }
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log(`✅ Saved ${studio.rel(file)} for channel "${got.snippet.title}".`);
}

main().catch(fail);
