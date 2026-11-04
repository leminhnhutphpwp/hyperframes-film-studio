# publish/ — uploading videos and reading analytics

Install once: `cd publish && npm install`. Run every command from the studio root.
`<project>` is the film folder (`projects/<channel>/<film>[/<part>]`); the channel is taken from that folder.
Channel-level commands need `--channel=<channel>` (a folder name in `channels/`, for example `my-channel`).
`--lang=en` picks the `.en` version of the files in `publish/`.

| Command | What it does | Kind |
|---|---|---|
| `node publish/youtube/analytics.js --channel=<channel> [--days 90]` | Real channel analytics: traffic sources, search terms, retention per video | read-only |
| `node publish/youtube/retention.js <project\|videoId> [--days 120]` | Which chapter viewers leave at | read-only |
| `node publish/youtube/research.js --channel=<channel> "topic"` | Finds channels in the same niche and outlier episodes → writes `channels/<channel>/research/` | read-only on YouTube (uses quota) |
| `node publish/facebook/comments.js --channel=<channel>` | Lists Facebook page comments with no reply yet | read-only |
| `node publish/youtube/upload.js <project>` | Uploads the video as PRIVATE + thumbnail, localisations, playlist, captions (if the meta has them) | **owner approval** (`--yes`) |
| `node publish/youtube/set-privacy.js <project> public\|unlisted\|private` | Changes visibility | **owner approval** (`--yes`) |
| `node publish/youtube/set-title.js <project>` | Changes the title from `youtube-meta*.json` | **owner approval** (`--yes`) |
| `node publish/youtube/localize.js <project>` | Adds translated titles/descriptions (`localizations`) | **owner approval** (`--yes`) |
| `node publish/youtube/captions.js <project> --langs vi` | Uploads .srt caption tracks | **owner approval** (`--yes`) |
| `node publish/youtube/comment.js <project>` | Posts the first comment from `publish/comment.txt` | **owner approval** (`--yes`) |
| `node publish/youtube/delete.js <project>` | PERMANENTLY deletes the video and cleans up the records | **owner approval** (`--yes`) |
| `node publish/facebook/video.js <project> --video=<file>` | Posts the full episode to the Facebook page + cover image + a link comment | **owner approval** (`--yes`) |
| `node publish/facebook/photo.js <project>` | Posts a photo post to the Facebook page + a link comment | **owner approval** (`--yes`) |
| `node publish/facebook/comments.js --channel=<channel> --reply <id> "…"` | Replies to one approved comment | **owner approval** (`--yes`) |
| `node publish/youtube/auth.js --channel=<channel>` / `publish/facebook/auth.js` | Signs in again and saves the token to `secrets/<channel>/` | the owner runs it |

## Rules

- Without `--yes`, every command only **previews**: it prints what it would do and sends nothing.
- An agent **never** runs upload, set-privacy, set-title, localize, delete, captions or comment (YouTube or Facebook)
  with `--yes` unless the channel owner has clearly said so for **that exact video**. One approval does not carry
  over to another video.
- Uploads are always **private**. Any other visibility needs both `--privacy=<x>` and `--yes`. Making a video public,
  scheduling it and the end screen are done by the owner in YouTube Studio.
- An English version does not go to a Vietnamese channel (upload.js refuses when the video language differs from
  the channel language).
- A published video is never uploaded again (it is skipped if `publish/youtube[.<lang>].json` exists).
- Tokens are per channel: `secrets/<channel>/youtube-token.json`, `secrets/<channel>/facebook-token.json` (git-ignored,
  never printed). Every command checks that the token belongs to the channel in `channels/<channel>/channel.js` — and
  stops if it does not.

## Records

- `<project>/publish/youtube[.<lang>].json` — the project's videoId, url and status.
- `channels/<channel>/published/<videoId>.json` — the channel's log of published videos.
- `<project>/publish/facebook.json` — posts made to the Facebook page.
- Built videos are in `<project>/out/` or the archive `$STUDIO_ARCHIVE/<same path>` (default `archive/`); the commands
  look in both.
