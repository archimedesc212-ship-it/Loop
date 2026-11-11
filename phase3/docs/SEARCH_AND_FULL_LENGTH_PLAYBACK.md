# Search autocomplete and full-length playback

## Search behavior

- The top-bar autocomplete requests the dedicated `/api/search/suggest` endpoint only after the user enters at least two characters. This endpoint does not write to listening/search history.
- Requests are debounced and stale responses are ignored.
- Suggestions include matching songs, artists and albums. The endpoint returns at most five songs, three artists and two albums. Arrow Up/Down, Enter and Escape are supported.
- Submitting the form starts the full search across LOOP, YouTube, Apple Music, MusicBrainz, Jamendo (when enabled) and Openverse audio. YouTube Data API calls are not made for each typed character, preserving API quota. Openverse uses a small anonymous browser request and remains subject to its rate limits.
- Search input and suggestion text use high-contrast light text on dark surfaces.

## Playback behavior

- Apple Music catalogue preview URLs are short promotional samples, typically around 30 seconds. LOOP cannot turn these sample files into full songs.
- Apple Music full playback is controlled by Apple's official embedded player and may require a subscription and supported territory/account.
- YouTube results are restricted to the Music category and use the official visible YouTube embedded player. LOOP requests the actual video duration and current embed permission with `videos.list`; when that optional lookup fails, results still appear and duration is marked unavailable. The listener hears the uploaded video's full duration when the selected video actually contains the full recording and embedding is allowed. Some uploads are clips, blocked, region-restricted or unavailable; LOOP cannot override those restrictions.
- YouTube results display the API-reported duration and are filtered against current embedding permission when the duration lookup succeeds. A `2+ min` filter can hide shorter clips, but it is only a convenience—not proof that a long video is the full recording.
- Each Apple catalogue result now offers a `Full version` route that searches the same track and artist plus `official audio`, making YouTube options easier to find.
- Openverse direct-source results play as audio from the original HTTPS host. Track cards show the creator, source, licence and API-provided attribution details. Openverse does not verify each licence or guarantee a working/full recording; check the original source before relying on a track. LOOP does not download, cache, proxy, convert or re-host those files.
- Spotify is linked out to Spotify's official search experience. This release does not call the Spotify API or integrate Spotify streams/content into the multi-provider player.
- No YouTube audio is downloaded, extracted, separated, proxied or re-hosted; the official player remains visible.

## Recommended next improvements

1. Add explicit content/version labels such as Official Audio, Official Music Video, Live, Remix and Clip using verified metadata only.
2. Add a configurable licensed full-catalog playback provider for tracks that need in-app full-length audio.
3. Add recent-search suggestions and a clear button, with local-only storage unless the listener opts into account search history.
4. Add browser tests for keyboard autocomplete, contrast, embed errors and mobile overflow.
