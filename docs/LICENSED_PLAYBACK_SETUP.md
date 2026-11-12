# LOOP licensed playback setup

## Your YouTube Data API key is for discovery, not audio licensing

LOOP can use YouTube Data API v3 to find song/video metadata, thumbnails, channel names and durations. A Data API key does not grant a licence to stream the recording as a standalone audio track. This release uses YouTube for music discovery and the official visible YouTube iframe for playback when a listener selects a result. The iframe is enabled by default for YouTube search results. Set `VITE_ENABLE_YOUTUBE_EMBED_PLAYBACK=false` to disable it. LOOP never extracts audio, hides the official player, or runs YouTube playback in the background.

Do not download, extract, proxy, re-host, strip or background-play YouTube audio. Do not hide the official player, its controls, attribution or ads.

## 1. Configure YouTube discovery

Set these variables in the backend environment (local `.env`, and Vercel Project → Settings → Environment Variables):

```dotenv
YOUTUBE_ENABLED=true
YOUTUBE_API_KEY=your_google_cloud_api_key
```

Enable **YouTube Data API v3** in Google Cloud. Restrict the key to that API. For a backend-only key, use suitable server/IP restrictions where your hosting topology supports them. Never commit the key to Git. Do not set `VITE_YOUTUBE_API_KEY` for this licensed-playback deployment: `VITE_` values are bundled into browser code and are public.

The project uses the backend YouTube provider route for search. Search requests consume YouTube quota; Google currently documents 100 `search.list` calls per day by default for a project, so debounce search and avoid calling it on every keystroke.

## 2. Attach licensed audio to LOOP catalogue records

The existing backend already implements a media resolver with these supported source types:

- `USER_LOCAL`: a file that you own or have permission to distribute, placed in `LOCAL_MEDIA_DIR` on a persistent Node host and registered to a catalogue song.
- `PREVIEW` from `EXTERNAL_PREVIEW`: a short, licensed preview resolved at play time by ISRC through the vendor-neutral provider adapter.
- `FULL` / `PREVIEW`: an HTTPS media URL stored in the `song_media` table for a source whose contract explicitly grants the necessary streaming rights.
- `ARTIST_UPLOAD`: artist-submitted files remain subject to the existing quarantine, malware scan, metadata review, rights declaration and publishing workflow.

A full-track provider must grant LOOP and its users the rights to stream the recording in every territory where it is offered. Confirm whether the licence covers on-demand interactive streaming, commercial use, territories, user counts, reporting/royalties, caching, CDN delivery and expiry. A preview-only licence is not a full-track licence.

For the external preview adapter, implement the documented contract in `backend/src/providers/externalPreview.js` and set:

```dotenv
EXTERNAL_PREVIEW_ENABLED=true
EXTERNAL_PREVIEW_BASE_URL=https://your-licensed-provider.example/api
EXTERNAL_PREVIEW_API_KEY=your_provider_secret
EXTERNAL_PREVIEW_MEDIA_ORIGIN=https://your-audio-cdn.example
```

That adapter intentionally resolves short previews only. Do not relabel a preview as a full track. A full-track provider needs its own adapter and database source/media type configuration based on its actual contract; do not paste a random CDN URL into the database.

## 3. Vercel storage warning

The local filesystem is not durable on Vercel serverless. `LOCAL_MEDIA` is automatically disabled in serverless mode. For production full-length playback on Vercel, use a licensed provider or persistent object storage/CDN with signed URLs and a backend authorization check. Do not store large music files in the deployment bundle or rely on `/tmp` for permanent media.

## 4. Playback behavior in this release

- Licensed media returned by the backend is played through LOOP's native audio player.
- YouTube results play through the official visible YouTube iframe after the listener chooses a result. The iframe retains YouTube controls and branding; playback may be unavailable where the owner disables embedding or regional restrictions apply.
- Set `VITE_ENABLE_YOUTUBE_EMBED_PLAYBACK=false` to disable YouTube embeds. This is video playback, not independent/audio-only streaming; LOOP does not extract, separate, hide, or background-play the audio.
- Tracks without an authorized playable source remain metadata-only; LOOP must not invent an audio URL.

## 5. Validation before launch

1. Add a test recording that you own or have explicit streaming rights to.
2. Register it against a real catalogue song using the existing media registration/admin workflow.
3. Verify `GET /api/providers` reports the expected provider as ready.
4. Play the track in desktop and mobile browsers; verify pause, resume, seek, next, previous and end events.
5. Confirm that a track without a licensed source does not play a YouTube result in licensed mode.
6. Confirm that the provider's licence, attribution and territorial rules are reflected in the product and terms.

## 6. Jamendo non-commercial catalogue streaming

Jamendo is integrated as an optional independent-music source. Create an application in the Jamendo developer portal and configure the backend only:

```dotenv
JAMENDO_ENABLED=true
JAMENDO_CLIENT_ID=your_jamendo_application_client_id
```

The `GET /api/music/jamendo?q=<query>&limit=12` route searches Jamendo's v3 `/tracks/` endpoint with `include=licenses` and `audioformat=mp32`. The Search page displays the artist, artwork, source link and licence link. Selecting a result plays the returned HTTPS `audio` URL in the LOOP HTML audio player. The app does not download, cache, proxy, or re-host the track, and Jamendo playback does not write a local catalogue-song history record because the Jamendo track is not a LOOP database song.

Jamendo's API terms permit non-commercial API use. Non-commercial does not mean that every use of every track is automatically permitted: check the actual Creative Commons licence for each track, preserve required attribution, do not make derivative works where prohibited, and observe any NonCommercial and ShareAlike conditions. Do not add advertising, subscriptions, affiliate revenue, paid access, or other commercial advantage without obtaining Jamendo's separate commercial licence. Do not implement offline access or caching. If LOOP's business model changes, disable Jamendo until Jamendo confirms the required licence.

The adapter deliberately returns only HTTPS audio URLs. A missing or non-HTTPS stream is excluded from results. Jamendo API access and track stream availability can change; users may see a track unavailable if the artist removes it or the provider declines playback.
