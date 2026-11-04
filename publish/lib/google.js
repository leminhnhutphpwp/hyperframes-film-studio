// ============================================================
//  publish/lib/google.js — only the Google APIs the studio uses (YouTube Data v3, YouTube Analytics v2, OAuth2)
//
//  Replaces the full `googleapis` package (~200 MB, every Google API) with the same call style:
//  google.auth.OAuth2 / google.youtube({version:'v3'}) / google.youtubeAnalytics({version:'v2'}).
// ============================================================

'use strict';

const { youtube, auth } = require('@googleapis/youtube');
const { youtubeAnalytics } = require('@googleapis/youtubeanalytics');

module.exports = { google: { auth, youtube, youtubeAnalytics } };
