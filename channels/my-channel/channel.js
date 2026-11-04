// channels/my-channel/channel.js — one channel's identity, read by publish/lib/studio.js.
// Copy this folder to channels/<your-channel-id>/ and fill in your own channel. Uploads are always 'private'
// unless you pass an explicit privacy flag; the YouTube token must match channelId (publish/lib/youtube.js checks).

'use strict';

module.exports = {
  name: 'My Channel',
  handle: '@MyChannel',
  channelId: null, // filled in by `node publish/youtube/auth.js --channel=<channel>` on first sign-in
  url: 'https://www.youtube.com/@MyChannel',
  subscribeUrl: 'https://www.youtube.com/@MyChannel?sub_confirmation=1',
  tagline: 'Short, sourced history stories told with paper cut-out animation',

  // Brand SEO tags, always first in every video's tag list.
  brandTags: ['history explained', 'paper cut-out animation'],
  // Brand hashtags (no '#'), first so they land in the 3 hashtags YouTube shows above the title.
  brandHashtags: ['history'],

  // Caption tracks: the FIRST is the source (built from the timeline), the rest are translated cue by cue.
  // Uploaded as separate tracks, never burned into the video. Leave empty for no captions.
  language: 'en',
  captionLanguages: [],
  // Other-language cuts of this channel's films can go to a sister channel: { vi: '<channel-id folder>' }.
  languageChannels: {},

  // 27 = Education, 24 = Entertainment.
  defaultCategoryId: '27',

  // Facebook page: { pageId, playlists: { '<title>': '<playlist id>' } }, or null.
  facebook: null,
};
