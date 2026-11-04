// ============================================================
//  publish/lib/youtube.js — YouTube Data API for ONE studio channel
//
//  const yt = new YouTubeProvider(studio.channel({ project }));  await yt.initialize();
//  Token: secrets/<channel>/youtube-token.json (create it with: node publish/youtube/auth.js --channel=<channel>).
//  Uploads / edits call assertExpectedChannel() first: a token for another channel stops the run.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('./google');
const { SECRETS_DIR, rel } = require('./studio');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
  // Uploading captions (captions.insert) and reading comments need the force-ssl scope.
  'https://www.googleapis.com/auth/youtube.force-ssl'
];

const CREDENTIALS_PATH = path.join(SECRETS_DIR, 'google-oauth-client.json');
const tokenPath = (ch) => path.join(ch.secrets, 'youtube-token.json');

class YouTubeProvider {
  constructor(ch) {
    if (!ch || !ch.config) throw new Error('YouTubeProvider needs a channel: new YouTubeProvider(studio.channel(...))');
    this.ch = ch;
    this.expectedChannelId = ch.config.channelId;
    this.tokenPath = tokenPath(ch);
    this.auth = null;
    this.youtube = null;
    this.channel = null;
  }

  async initialize() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error('Google credentials.json not found at ' + CREDENTIALS_PATH);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed;

    this.oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Saved token; if missing -> sign in with the separate script (receives the code via localhost).
    if (!fs.existsSync(this.tokenPath)) {
      throw new Error(`Missing ${rel(this.tokenPath)} — sign in to the channel first: node publish/youtube/auth.js --channel=${this.ch.id}`);
    }
    this.oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(this.tokenPath, 'utf8')));
    // Google refreshed the access token → save it so it does not need refreshing next time.
    this.oAuth2Client.on('tokens', (t) => {
      const cur = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
      fs.writeFileSync(this.tokenPath, JSON.stringify({ ...cur, ...t }, null, 2), { mode: 0o600 });
    });

    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oAuth2Client
    });

    // Cache channel info
    await this.fetchChannelInfo();
    return true;
  }

  // Guard against posting to the wrong channel: the token must belong to EXPECTED_CHANNEL_ID.
  assertExpectedChannel() {
    if (!this.channel) throw new Error('Channel info has not been loaded.');
    if (!this.expectedChannelId) throw new Error(`No channelId in channels/${this.ch.id}/channel.js — uploads blocked.`);
    if (this.channel.id !== this.expectedChannelId) {
      throw new Error(`Token belongs to channel "${this.channel.snippet.title}" (${this.channel.id}), `
        + `not channel ${this.ch.id} (${this.expectedChannelId}). Sign in again: node publish/youtube/auth.js --channel=${this.ch.id}`);
    }
    return this.channel;
  }

  // Custom thumbnail (the channel must be phone-verified). YouTube limit is 2MB.
  async setThumbnail(videoId, imagePath) {
    const size = fs.statSync(imagePath).size;
    if (size > 2 * 1024 * 1024) {
      throw new Error(`Thumbnail ${(size / 1048576).toFixed(1)}MB exceeds YouTube's 2MB limit`);
    }
    const mimeType = /\.png$/i.test(imagePath) ? 'image/png' : 'image/jpeg';
    const res = await this.youtube.thumbnails.set({
      videoId,
      media: { mimeType, body: fs.createReadStream(imagePath) },
    });
    return res.data;
  }

  async fetchChannelInfo() {
    try {
      const response = await this.youtube.channels.list({
        part: 'snippet,statistics,contentDetails',
        mine: true,
      });

      if (response.data.items.length === 0) {
        throw new Error('No channel found');
      }

      this.channel = response.data.items[0];
      return this.channel;
    } catch (error) {
      console.error('❌ Error fetching channel info:', error.message);
      throw error;
    }
  }

  async getChannelStats() {
    if (!this.channel) await this.fetchChannelInfo();

    const stats = this.channel.statistics;
    return {
      channelId: this.channel.id,
      channelTitle: this.channel.snippet.title,
      description: this.channel.snippet.description,
      thumbnailUrl: this.channel.snippet.thumbnails.default.url,
      subscriberCount: parseInt(stats.subscriberCount) || 0,
      viewCount: parseInt(stats.viewCount) || 0,
      videoCount: parseInt(stats.videoCount) || 0,
      hiddenSubscriberCount: stats.hiddenSubscriberCount || false,
    };
  }

  async uploadVideo(videoFilePath, metadata) {
    try {
      if (!fs.existsSync(videoFilePath)) {
        throw new Error(`Video file not found: ${videoFilePath}`);
      }

      const fileSize = fs.statSync(videoFilePath).size;
      console.log(`Uploading: ${videoFilePath} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

      const response = await this.youtube.videos.insert(
        {
          part: 'snippet,status',
          requestBody: {
            snippet: {
              title: (metadata.title || 'Untitled').substring(0, 100),
              description: (metadata.description || 'Auto-generated video').substring(0, 5000),
              tags: (metadata.tags || []).filter(t => t).slice(0, 30),
              categoryId: metadata.categoryId || '24',
              // title/description language + spoken audio language (e.g. 'vi')
              ...(metadata.language ? { defaultLanguage: metadata.language, defaultAudioLanguage: metadata.language } : {}),
            },
            status: {
              privacyStatus: metadata.privacyStatus || 'private',
              selfDeclaredMadeForKids: metadata.madeForKids || false,
            },
          },
          media: {
            body: fs.createReadStream(videoFilePath),
          },
        },
        {
          onUploadProgress: (evt) => {
            const progress = Math.round((evt.bytesRead / fileSize) * 100);
            if (progress % 20 === 0) {
              console.log(`   Upload: ${progress}%`);
            }
          },
        }
      );

      const videoId = response.data.id;
      console.log(`✅ Video uploaded: ${videoId}`);

      return {
        videoId,
        title: response.data.snippet.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        status: response.data.status.privacyStatus,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Upload error details:');
      console.error('  Message:', error.message);
      if (error.errors) {
        console.error('  API Errors:', error.errors);
      }
      if (error.status) {
        console.error('  Status:', error.status);
      }
      throw error;
    }
  }

  async updateVideo(videoId, metadata) {
    try {
      const response = await this.youtube.videos.update({
        part: 'snippet,status',
        requestBody: {
          id: videoId,
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: metadata.categoryId || '24',
            localized: {
              title: metadata.title,
              description: metadata.description,
            }
          },
          status: {
            privacyStatus: metadata.privacyStatus,
            selfDeclaredMadeForKids: metadata.madeForKids || false,
          }
        }
      });

      console.log(`✅ Video updated: ${videoId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Update error:', error.message);
      throw error;
    }
  }

  async getVideoStats(videoId) {
    try {
      const response = await this.youtube.videos.list({
        part: 'statistics,snippet,status',
        id: videoId,
      });

      if (response.data.items.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const video = response.data.items[0];
      const stats = video.statistics;

      return {
        videoId,
        title: video.snippet.title,
        status: video.status.privacyStatus,
        views: parseInt(stats.viewCount) || 0,
        likes: parseInt(stats.likeCount) || 0,
        comments: parseInt(stats.commentCount) || 0,
        shares: parseInt(stats.shareCount) || 0,
        favoriteCount: parseInt(stats.favoriteCount) || 0,
      };
    } catch (error) {
      console.error('❌ Error fetching video stats:', error.message);
      throw error;
    }
  }

  async getChannelVideos(maxResults = 10) {
    try {
      if (!this.channel) await this.fetchChannelInfo();

      const playlistId = this.channel.contentDetails.relatedPlaylists.uploads;

      const response = await this.youtube.playlistItems.list({
        part: 'snippet,contentDetails',
        playlistId,
        maxResults,
      });

      return response.data.items.map(item => ({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails.default.url,
      }));
    } catch (error) {
      console.error('❌ Error fetching channel videos:', error.message);
      throw error;
    }
  }

  async getComments(videoId, maxResults = 20) {
    try {
      const response = await this.youtube.commentThreads.list({
        part: 'snippet',
        videoId,
        maxResults,
        textFormat: 'plainText',
      });

      return response.data.items.map(thread => ({
        authorName: thread.snippet.topLevelComment.snippet.authorDisplayName,
        text: thread.snippet.topLevelComment.snippet.textDisplay,
        likes: thread.snippet.topLevelComment.snippet.likeCount,
        publishedAt: thread.snippet.topLevelComment.snippet.publishedAt,
        replyCount: thread.snippet.totalReplyCount,
      }));
    } catch (error) {
      console.error('❌ Error fetching comments:', error.message);
      throw error;
    }
  }

  async createPlaylist(title, description) {
    try {
      const response = await this.youtube.playlists.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title,
            description,
            defaultLanguage: 'en',
          },
          status: {
            privacyStatus: 'private',
          }
        }
      });

      const playlistId = response.data.id;
      console.log(`✅ Playlist created: ${playlistId}`);
      return { playlistId, title };
    } catch (error) {
      console.error('❌ Error creating playlist:', error.message);
      throw error;
    }
  }

  // Find a channel playlist by TITLE (case-insensitive match, extra whitespace trimmed).
  async findPlaylistByTitle(title) {
    const norm = (s) => String(s || '').normalize('NFC').trim().toLowerCase();
    let pageToken;
    do {
      const res = await this.youtube.playlists.list({ part: ['snippet'], mine: true, maxResults: 50, pageToken });
      const hit = (res.data.items || []).find((p) => norm(p.snippet.title) === norm(title));
      if (hit) return { playlistId: hit.id, title: hit.snippet.title };
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    return null;
  }

  async isVideoInPlaylist(playlistId, videoId) {
    const res = await this.youtube.playlistItems.list({ part: ['id'], playlistId, videoId, maxResults: 1 });
    return (res.data.items || []).length > 0;
  }

  // Add a video to an EXISTING playlist by title (docs/rules/*: one playlist per genre).
  // Never creates the playlist — if it is missing, throw so the user decides. Already in it → skip.
  async addToPlaylistByTitle(title, videoId) {
    const pl = await this.findPlaylistByTitle(title);
    if (!pl) throw new Error(`Channel has no playlist "${title}" — create it in Studio (or ask the user) and run again.`);
    if (await this.isVideoInPlaylist(pl.playlistId, videoId)) return { ...pl, added: false };
    await this.addVideoToPlaylist(pl.playlistId, videoId);
    return { ...pl, added: true };
  }

  async addVideoToPlaylist(playlistId, videoId) {
    try {
      const response = await this.youtube.playlistItems.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            }
          }
        }
      });

      console.log(`✅ Video added to playlist: ${videoId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error adding video to playlist:', error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      const stats = await this.getChannelStats();
      console.log('✅ YouTube API Connected!');
      console.log(`   Channel: ${stats.channelTitle}`);
      console.log(`   Subscribers: ${stats.subscriberCount}`);
      return { success: true, channel: stats };
    } catch (error) {
      console.error('❌ YouTube API connection failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async isAvailable() {
    return this.auth !== null && this.youtube !== null;
  }

  describe() {
    return {
      name: 'YouTube Data API v3',
      version: '1.0.0',
      type: 'YouTube Integration',
      capabilities: [
        'Upload videos',
        'Update video metadata',
        'Get channel statistics',
        'Fetch video performance',
        'Manage playlists',
        'Read comments',
        'Schedule videos',
      ],
      status: this.isAvailable() ? 'ready' : 'not initialized'
    };
  }
}

module.exports = YouTubeProvider;
module.exports.SCOPES = SCOPES;
module.exports.tokenPath = tokenPath;
module.exports.CREDENTIALS_PATH = CREDENTIALS_PATH;
