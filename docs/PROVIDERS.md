# External providers — integration guide and credentials checklist

The DBMS academic edition of LOOP has a focused listener workflow: Spotify catalogue
search plus Spotify's official embedded player, with LOOP-owned accounts, playlists,
search history and database reporting in MySQL. Older Openverse, Jamendo, YouTube,
MusicBrainz and other adapters remain in the codebase for optional experiments but
are not combined with Spotify in the primary listening UI. Keep those adapters off
for the Spotify-focused classroom demonstration.

Code: `backend/src/providers/` (one adapter per provider, shared HTTP client in
`http.js`, configuration in `config.js`, registry and status in `index.js`).
Admin UI: **Admin › Providers & media**. Status without secrets: `GET /api/ready`.

## How every adapter behaves

| Concern | Behaviour |
|---|---|
| Disabled state | `check()` returns `disabled`, `missing_credentials` (lists the variable names), `invalid_config` (says what is wrong) or `ready`. Calls on a provider that is not `ready` throw `DISABLED` / `MISCONFIGURED`; the API answers 409 `PROVIDER_NOT_CONFIGURED` |
| Timeouts | `PROVIDER_TIMEOUT_MS` per attempt (`AbortSignal.timeout`) |
| Retries | `PROVIDER_RETRIES` with exponential back-off + jitter, only for network errors, timeouts, 429 and 5xx; `Retry-After` honoured up to 10 s; 4xx (bad key, not found) is never retried |
| Rate limits | per-provider minimum interval between requests (MusicBrainz 1.1 s) |
| Errors | stable codes: `TIMEOUT`, `NETWORK`, `RATE_LIMITED`, `HTTP_ERROR` (with status), `BAD_RESPONSE`, `NOT_FOUND`. Messages never contain query strings, so API keys never reach logs or clients. Admin actions map them to `PROVIDER_TIMEOUT` (504), `PROVIDER_UNREACHABLE` (502), `PROVIDER_CREDENTIALS_REJECTED` (502, for 401/403), `PROVIDER_RATE_LIMITED` (429) … |
| Idempotent imports | results are stored in `source_records`, unique on (source, entity type, external id). Re-running an import updates the same row (`created: false`, `changed: true/false`); a record already linked to a different song/film is never moved silently (409 `ALREADY_LINKED` or skipped) |
| Provenance | `source_records` keeps source, external id, URL, rights status, payload, payload hash, match method and confidence, processing version and timestamps |
| Attribution | shown where the data is used (film page, song page, player) and in Settings › About and credits |
| Tests | `backend/tests/09-providers.test.js` runs every adapter against a **local mock HTTP server**: disabled/missing/invalid config, timeouts, bounded retries, 5xx then success, 429 + Retry-After, 401 not retried, non-JSON, refused connection, request spacing, mapping, idempotent imports, error mapping, playback fallback, AI restrictions. No ordinary test makes a real external request |

## The providers

### Openverse — openly licensed audio discovery and direct-source playback

- **Purpose**: search the Openverse audio catalogue from the listener's browser and play a returned HTTPS audio URL directly from its original host. This adapter accepts music-category results with a known Creative Commons or public-domain licence identifier and a source page, creator information and licence URL.
- **Credentials**: no API key is required for anonymous search. Requests use the public `https://api.openverse.org/v1/audio/` endpoint with a small first page. Anonymous rate limits are enforced by Openverse and may change; respect the response headers and do not scrape or loop requests.
- **Playback boundary**: LOOP uses the browser audio element against the original URL. It does not download, cache, proxy, convert, or re-host the recording. Full-length playback depends on the source URL still working and allowing browser playback; Openverse does not guarantee every result is a complete or playable recording.
- **Rights and attribution**: Openverse aggregates third-party metadata and does not verify that each licence is accurate. Independently inspect the original source and per-track licence before use. LOOP displays the creator, source, licence link and the API-provided attribution text. CC BY / BY-SA require attribution; NC licences are only suitable for non-commercial use; ND licences must remain unadapted; SA conditions apply to adaptations. Public launch or any change to LOOP's business model requires a fresh rights review.
- **Notice**: the Search page states that it is made using Openverse but is not endorsed or certified by Openverse. Do not imply Openverse endorsement or use its logos without permission.
- **Test**: `frontend/src/lib/openverse.test.js` covers mapping, HTTPS-only URLs, licence allow-list, bounded requests and rate-limit errors with mock responses. A browser/live-source playback test is still required for the chosen tracks.
- **References**: https://api.openverse.org/v1/ · https://docs.openverse.org/api/reference/made_with_ov.html · https://docs.openverse.org/_preview/2205/terms_of_service.html

### Spotify — catalogue search + official embedded player

- **Purpose**: Spotify catalogue search is authorised with the signed-in user's OAuth token (Authorization Code with PKCE). Search results are displayed in LOOP with Spotify-provided artwork/metadata and a link to the Spotify source. Selecting a track opens Spotify's own official embedded player inside LOOP; the Spotify iframe owns its playback controls and stream.
- **Credentials**: enter the Spotify **Client ID** in **Settings → Spotify connection**. This browser PKCE client does not need the Client Secret. Do not add a Spotify secret to `VITE_*`, source control, screenshots, or the browser. Tokens stay in browser session storage; the access token is sent to the backend only on the authenticated search request.
- **DBMS records**: successful search requests insert the query, normalized query and result count into MySQL `search_history`. Opening a selected embed inserts the LOOP user ID, Spotify track ID, event type and timestamp into `spotify_embed_events`. LOOP does not persist Spotify tokens, copy the Spotify catalogue into its own song tables, or store audio.
- **Playback boundary**: the official embed may provide full-track playback depending on the user's Spotify account, market, selected track and Spotify's embed experience. A Client ID is not an audio-stream key. No Spotify audio extraction, download, cache, proxy or re-hosting is implemented.
- **Redirect URI**: use the exact URI shown in Settings. Local development uses `http://127.0.0.1:5173/spotify/callback`; do not open the app as `localhost`. Deployed sites use their HTTPS origin plus `/spotify/callback`.
- **Policy**: Spotify restricts mixing Spotify streams/content with another music service, replacing/mimicking Spotify's core experience without written permission, and commercial use of its streaming SDK without prior written approval. This project keeps the official Spotify player separate from other provider adapters. Do not advertise commercial streaming access unless Spotify has approved the use case.
- **References**: https://developer.spotify.com/policy · https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed · https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

### Jamendo — non-commercial catalogue search and streaming

- **Purpose**: search independent tracks and stream the HTTPS `audio` URL returned by Jamendo's `/tracks/` read method. The player uses the browser audio element; LOOP does not download, cache, proxy, or re-host Jamendo audio.
- **Credentials**: create an application at https://devportal.jamendo.com/ and set `JAMENDO_ENABLED=true` plus `JAMENDO_CLIENT_ID`. The read-only plan is sufficient for search.
- **Terms**: Jamendo's API terms permit non-commercial API use; commercial advantage, advertising, subscriptions, or other monetization require a separate licence. Each recording has its own Creative Commons terms. LOOP displays artist attribution and the licence link where returned; users must respect attribution, non-commercial, share-alike, and no-derivatives conditions. Do not offer offline access or caching.
- **Integration**: `GET /api/music/jamendo?q=<query>&limit=12` returns normalized tracks including a direct stream URL, source page, and licence URL.
- **Test**: enable the provider and search from the Search page; start a Jamendo result and verify play/pause/seek/next. Automated adapter tests use a local mock server and never contact Jamendo.

### 1. MusicBrainz — recording metadata

- **Purpose**: discover recordings (title, artist, album, duration, ISRC, year) for the ingestion pipeline (Admin › Pipeline › "Ingest from MusicBrainz"). Metadata only; no audio, artwork or audio features (songs stay `PENDING_ANALYSIS` until analysed).
- **Credential**: none, but a descriptive User-Agent with contact details is required.
- **Settings**: `MUSICBRAINZ_ENABLED=true`, `MUSICBRAINZ_USER_AGENT=MUSE/1.0 (you@example.com)`.
- **Terms**: non-commercial use of the web service is free (commercial plans exist); about 1 request per second per IP on average — MUSE spaces requests 1.1 s apart; exceeding it gets HTTP 503. https://musicbrainz.org/doc/MusicBrainz_API and https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting

### 2. TMDB — film details for soundtracks

- **Purpose**: attach a film's TMDB id, original title, year and overview to MUSE's `films` (Admin › Providers & media › Film details). Shown on the film page with the TMDB notice and a link back. **Posters and backdrops are not downloaded or stored.**
- **Matching**: without an id, only a single confident match is stored (same normalised title, year ±1); otherwise up to five candidates are returned and the admin picks one.
- **Credential**: API Read Access Token (v4, preferred) or API key (v3), from your TMDB account settings.
- **Settings**: `TMDB_ENABLED=true` and `TMDB_READ_ACCESS_TOKEN=…` (or `TMDB_API_KEY=…`).
- **Terms**: free for non-commercial use with attribution; commercial use needs a licence from TMDB. Display "This product uses the TMDB API but is not endorsed or certified by TMDB." (done: film page and Settings › About and credits) **and an approved TMDB logo** in an About/Credits section — the logo is not bundled; add it from TMDB's official logo page before a public launch. https://developer.themoviedb.org/docs/faq

### 3. YouTube Data API v3 — video links

- **Purpose**: find up to three public videos for a song (Admin, `POST /admin/songs/:id/video-links`) and show them as "Watch elsewhere" links on the song page. MUSE stores id, title, channel and URL only and links out. **It never downloads, re-hosts or extracts audio or video.**
- **Credential**: a Google Cloud API key with "YouTube Data API v3" enabled (restrict the key to that API, and by IP for a server).
- **Settings**: `YOUTUBE_ENABLED=true`, `YOUTUBE_API_KEY=…`.
- **Quota**: by default a project gets 100 `search.list` calls per day (and 10,000 units per day for other endpoints); each lookup and each admin "Test" uses one search call. Google can change this; check your project's Quotas page. YouTube API Services Terms apply. https://developers.google.com/youtube/v3/getting-started

### 4. TheAudioDB — artist and album metadata/artwork (no audio)

- **Purpose**: look up exact artist names and show artist banners, fan art, thumbnails/logos and album artwork on catalogue pages. The backend caches positive results for 24 hours and misses for 1 hour, validates returned image URLs, and spaces requests to remain below the free API's published 30 requests/minute limit.
- **Endpoints**: v1 `search.php?s=<artist>` and `searchalbum.php?s=<artist>&a=<album>`. The free shared key is `123`; a premium key can be supplied via `THEAUDIODB_API_KEY`.
- **Settings**: `THEAUDIODB_ENABLED=true`, `THEAUDIODB_API_KEY=123`. The provider is deliberately **off by default**. Its shared free key is for development/testing; TheAudioDB's current terms distinguish development use from public/App Store production releases. Confirm the applicable plan/permission before enabling it on a public production service.
- **Attribution**: pages link to TheAudioDB and identify its metadata/artwork contribution. Do not strip source notices or imply that TheAudioDB provides song recordings.
- **Important**: this integration returns metadata and image URLs only. It does **not** return an MP3, a full-track stream, or permission to play any recording. Album lookups that are unavailable on the selected API plan simply fall back to LOOP's generated cover artwork.
- **References**: https://www.theaudiodb.com/free_music_api · https://www.theaudiodb.com/api_guide.php · https://www.theaudiodb.com/terms_of_use.php

### 5. Licensed preview provider — playable previews (vendor-neutral)

- **Purpose**: make songs playable with short licensed previews, looked up by ISRC **at play time** (the URL is never stored).
- **Contract** any licensed provider, or a small proxy in front of one, must implement:
  ```
  GET {EXTERNAL_PREVIEW_BASE_URL}/previews?isrc=INABC2600001
  Authorization: Bearer {EXTERNAL_PREVIEW_API_KEY}
  200 {"previewUrl":"https://…","durationSec":30,"attribution":"Preview courtesy of …","expiresAt":"…"}
  404 when there is no preview for that recording
  ```
  Only `https://` URLs are accepted. 404 marks that song's preview `UNAVAILABLE` (the song falls back to the next source); timeouts and 5xx fall back for that play only.
- **Enable**: set `EXTERNAL_PREVIEW_ENABLED=true`, `EXTERNAL_PREVIEW_BASE_URL`, `EXTERNAL_PREVIEW_API_KEY`, `EXTERNAL_PREVIEW_MEDIA_ORIGIN` (the https origin the audio is served from — it is added to the CSP), restart, switch the `EXTERNAL_PREVIEW` source on in Admin › Pipeline › Sources, and register preview rows: `INSERT INTO song_media (song_id, source_id, media_type, uri, rights_status, priority) SELECT song_id, (SELECT source_id FROM music_sources WHERE code='EXTERNAL_PREVIEW'), 'PREVIEW', 'provider:EXTERNAL_PREVIEW', 'ATTRIBUTION_REQUIRED', 20 FROM songs WHERE isrc IS NOT NULL;`
- **Credential / terms**: depends entirely on the provider you contract. Use one only if its licence covers streaming previews to your users. MUSE does not name or recommend a vendor and does not scrape any service.

### 6. Local media — licensed files you hold

- **Purpose**: stream audio files you own or are licensed to use. On by default with an empty folder.
- **Settings**: `LOCAL_MEDIA_ENABLED=true`, `LOCAL_MEDIA_DIR=/path/to/media` (default `<repo>/media`).
- **Use**: copy `song-file.mp3` into the folder; Admin › Providers & media › Playback media → song id + file name → Register. Formats: mp3, m4a, aac, ogg, opus, wav, flac. Files are streamed only to signed-in users via `/api/media/:id` with range support. Missing files are detected (on play and hourly) and the song falls back.
- **Credential**: none. You are responsible for the rights to every file.

### 7. AI (optional) — fallback for free-text mood input

- **Purpose**: only when MUSE's own deterministic parser finds nothing in a sentence ("zxqv…" or unusual phrasing). The model may answer **only** with mood names and context codes that exist in MUSE; anything else is discarded. Never used in a private session. If the call fails, the user gets the same answer as without AI.
- **Credential**: an Anthropic API key (paid per token).
- **Settings**: `AI_PROVIDER=anthropic`, `AI_API_KEY=…`, `AI_MODEL=<a current model id from the Anthropic docs, e.g. a Haiku-class model for low cost>`.
- **Terms**: Anthropic's API terms and pricing. Only the typed sentence (≤ 280 characters) is sent. https://docs.claude.com/en/api/overview

## Final API credentials checklist

| Provider | Purpose | Credential needed | Config variable(s) | Where to get it | Quota / licensing | Exact integration test once configured |
|---|---|---|---|---|---|---|
| MusicBrainz | recording metadata for ingestion | none — a User-Agent with your contact email or URL | `MUSICBRAINZ_ENABLED=true`, `MUSICBRAINZ_USER_AGENT` | https://musicbrainz.org/doc/MusicBrainz_API | non-commercial free; ~1 req/s per IP | Admin › Providers & media › MusicBrainz › **Test** (expects "OK … 1 result"), then Admin › Pipeline › "Ingest from MusicBrainz" and check the job log and Review queue |
| TMDB | film details for soundtracks | API Read Access Token (v4) or API key (v3) | `TMDB_ENABLED=true`, `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` | https://www.themoviedb.org/settings/api | non-commercial free with attribution + logo; commercial needs a licence | **Test** on the TMDB row; then Film details › "Find on TMDB" for a film and open `/film/:id` — the overview and the TMDB notice appear; run it again → "already up to date" |
| Jamendo | non-commercial catalogue search and direct streaming | `JAMENDO_ENABLED=true`, `JAMENDO_CLIENT_ID` | Jamendo developer application Client ID | https://devportal.jamendo.com/ | non-commercial API use; per-track CC terms and attribution; no offline caching | Search page → Jamendo independent music → play a track; verify licence link and stream attribution |
| YouTube Data API v3 | video links on song pages | Google Cloud API key with YouTube Data API v3 enabled | `YOUTUBE_ENABLED=true`, `YOUTUBE_API_KEY` | https://console.cloud.google.com/apis/library/youtube.googleapis.com | 100 search calls/day by default; YouTube API Services Terms | **Test** (uses 1 search call); then `POST /api/admin/songs/1/video-links` as admin and open `/song/1` → "Watch elsewhere" |
| TheAudioDB | artist banners/fan art and optional album covers | shared development/test key `123` (premium key optional) | `THEAUDIODB_ENABLED=true`, `THEAUDIODB_API_KEY=123` | https://www.theaudiodb.com/free_music_api | free v1 rate limit 30/minute; current terms limit free shared-key use to development/testing; confirm production plan | **Test** in Admin › Providers & media; open an artist page with an exact TheAudioDB match → banner appears. This never enables audio playback |
| Licensed preview provider | short playable previews | whatever your contracted provider issues (bearer key) | `EXTERNAL_PREVIEW_ENABLED=true`, `EXTERNAL_PREVIEW_BASE_URL`, `EXTERNAL_PREVIEW_API_KEY`, `EXTERNAL_PREVIEW_MEDIA_ORIGIN` | your provider | per contract; must cover streaming previews | **Test** (resolves one ISRC); enable the source, register preview rows (SQL above), play a song with an ISRC → the player shows "Licensed preview · <attribution>" |
| Local media | your licensed audio files | none | `LOCAL_MEDIA_ENABLED`, `LOCAL_MEDIA_DIR` | — | you hold the rights | put a file in the folder, register it to a song, play the song → "Licensed local file"; delete the file → the song falls back and shows as unavailable |
| AI (optional) | free-text mood fallback | Anthropic API key | `AI_PROVIDER=anthropic`, `AI_API_KEY`, `AI_MODEL` | https://console.anthropic.com/ | paid per token | **Test** on the AI row; then Mood page → type a sentence MUSE's word list doesn't know → "How MUSE read that" says the AI helper suggested the moods |

## Step by step: adding credentials

1. Stop the API (`Ctrl+C`, or stop the service).
2. Open `.env` (never `.env.example`) and set the variables for **one** provider from the table above, including its `*_ENABLED=true`.
3. Start the API (`npm start` or `npm run dev`). The start-up line `Providers: … TMDB=ready …` shows the new state; `missing_credentials` lists what is still missing and `invalid_config` says what is wrong.
4. Sign in as an admin → **Admin › Providers & media** → press **Test** on that row. "OK in … ms" means the credential works; "rejected the configured credentials (HTTP 401)" means the key is wrong or not enabled for that API.
5. Run the provider's integration test from the checklist.
6. For playback providers, also switch the source on in **Admin › Pipeline › Sources** if it is off.
7. Repeat for the next provider. If anything misbehaves, set `*_ENABLED=false` and restart: MUSE goes back to working without it.

Keep keys out of the repository, screenshots and issue trackers. Restrict each key
to the one API it is for, and rotate it if it was ever exposed.


## Worldwide music search and artwork

- **YouTube Data API v3**: set `YOUTUBE_ENABLED=true` and configure `YOUTUBE_API_KEY` only in the backend host's secret/environment settings. Set frontend `VITE_DEMO_MODE=false` so search requests reach the live API instead of the local demo adapter. LOOP searches embeddable video results and plays them through YouTube's official iframe embed. LOOP does not extract, download, proxy, or re-host YouTube audio. Search quota is limited by Google's project quota.
- **MusicBrainz**: set `MUSICBRAINZ_ENABLED=true` and provide a descriptive `MUSICBRAINZ_USER_AGENT` including a real contact email or URL. LOOP searches recording metadata and release MBIDs while respecting the one-request-per-second service guidance.
- **Cover Art Archive**: release artwork is looked up using the MusicBrainz release MBID. The CAA image URLs are used directly; missing artwork is normal and falls back to LOOP's generated cover.
