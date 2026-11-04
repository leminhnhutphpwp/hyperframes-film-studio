// ============================================================
//  publish/lib/google.js — chỉ những API Google studio dùng (YouTube Data v3, YouTube Analytics v2, OAuth2)
//
//  Thay cho gói `googleapis` đầy đủ (~200 MB, mọi API của Google): cùng cách gọi
//  google.auth.OAuth2 / google.youtube({version:'v3'}) / google.youtubeAnalytics({version:'v2'}).
// ============================================================

'use strict';

const { youtube, auth } = require('@googleapis/youtube');
const { youtubeAnalytics } = require('@googleapis/youtubeanalytics');

module.exports = { google: { auth, youtube, youtubeAnalytics } };
