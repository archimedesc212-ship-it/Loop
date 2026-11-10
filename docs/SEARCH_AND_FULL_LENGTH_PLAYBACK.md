# Search autocomplete and full-length playback

## Search behavior

- The top-bar autocomplete requests the dedicated `/api/search/suggest` endpoint only after the user enters at least two characters. This endpoint does not write to listening/search history.
- Requests are debounced and stale responses are ignored.
- Suggestions include matching songs, artists and albums. The endpoint returns at most five songs, three artists and two albums. Arrow Up/Down, Enter and Escape are supported.
- Submitting the form starts the full search across LOOP, YouTube, Apple Music and MusicBrainz. YouTube Data API calls are not made for each typed character, preserving API quota.
- Search input and suggestion text use high-contrast light text on dark surfaces.

## Playback behavior

- Apple Music catalogue preview URLs are short promotional samples, typically around 30 seconds. LOOP cannot turn these sample files into full songs.
- Apple Music full playback is controlled by Apple's official embedded player and may require a subscription and supported territory/account.
- YouTube results use the official YouTube embedded player. LOOP now requests the actual video duration and current embed permission with `videos.list`; when that optional lookup fails, results still appear and duration is marked unavailable. The user hears the uploaded video's full duration when the selected video actually contains the full recording and embedding is allowed. Some uploads are clips, blocked, region-restricted or unavailable; LOOP cannot override those restrictions.
- YouTube results display the API-reported duration and are filtered against current embedding permission when the duration lookup succeeds. A `2+ min` filter can hide shorter clips, but it is only a convenience—not proof that a long video is the full recording.
- Each Apple catalogue result now offers a `Full version` route that searches the same track and artist plus `official audio`, making YouTube options easier to find.
- No provider audio is downloaded, extracted, proxied or re-hosted.

## Recommended next improvements

1. Add explicit content/version labels such as Official Audio, Official Music Video, Live, Remix and Clip using verified metadata only.
2. Add a configurable licensed full-catalog playback provider for tracks that need in-app full-length audio.
3. Add recent-search suggestions and a clear button, with local-only storage unless the listener opts into account search history.
4. Add browser tests for keyboard autocomplete, contrast, embed errors and mobile overflow.
