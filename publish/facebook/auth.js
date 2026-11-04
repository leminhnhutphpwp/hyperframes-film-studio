#!/usr/bin/env node
// ============================================================
//  publish/facebook/auth.js — gets a (non-expiring) Facebook PAGE token for a channel's fanpage
//
//  Needs in .env (studio root): FB_APP_ID, FB_APP_SECRET, FB_USER_TOKEN (short-lived user token created in the
//  Graph API Explorer, with pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement).
//  Steps: create an app at developers.facebook.com, get a user token in the Graph API Explorer with page-management permissions.
//
//  Run:  node publish/facebook/auth.js --channel=<channel>
//    1) exchanges FB_USER_TOKEN for a long-lived user token (~60 days);
//    2) gets the token of the page in channels/<channel>/channel.js facebook.pageId — a page token obtained from a
//       long-lived token does not expire;
//    3) saves secrets/<channel>/facebook-token.json (git-ignored); the old token is backed up to secrets/<channel>/old-tokens/.
//  Never prints the token. Afterwards, remove FB_USER_TOKEN from .env.
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
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')} — see channels/${ch.id}/docs/FACEBOOK.md`);

  const long = await FB.get('oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: shortToken,
  });
  const me = await FB.get('me', { fields: 'id,name', access_token: long.access_token });
  const pages = await FB.get('me/accounts', { fields: 'id,name,access_token,tasks', limit: 100, access_token: long.access_token });
  const page = (pages.data || []).find((p) => String(p.id) === pageId);
  if (!page) {
    const names = (pages.data || []).map((p) => `${p.name} (${p.id})`).join(', ') || 'no pages';
    throw new Error(`The token of ${me.name} does not manage page ${pageId}. Visible pages: ${names}. `
      + `When creating the token in the Graph API Explorer, make sure to select the page of channel ${ch.config.name}.`);
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
    console.log(`Old token backed up: ${studio.rel(backup)}`);
  }
  fs.writeFileSync(file, JSON.stringify({
    pageId: page.id, pageName: page.name, access_token: page.access_token,
    user: me.name, scopes, expiresAt: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'never',
    savedAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 });

  console.log(`✅ Saved the token for page "${page.name}" (${page.id}) to ${studio.rel(file)}`);
  console.log(`   Expires: ${d.expires_at ? new Date(d.expires_at * 1000).toLocaleString('vi-VN') : 'never'}`);
  if (lacking.length) console.log(`⚠️  Token is missing permissions: ${lacking.join(', ')} — create a new FB_USER_TOKEN with all of them and run again.`);
  console.log('   You can now remove FB_USER_TOKEN from .env.');
}

main().catch(fail);
