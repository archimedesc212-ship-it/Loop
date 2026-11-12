# LOOP UI recovery and worldwide music update — 11 November 2026

## What changed

- The immersive Now Playing screen now normalizes optional lyrics API fields before rendering. A missing, `null`, or malformed `lines` response becomes an empty list, so the player no longer calls `.find()` on an absent lyrics field.
- The player and related archive views now guard additional provider/API arrays before using `.find()` / `.map()` operations.
- External provider songs do not call LOOP's database-only lyrics, favourite, and private-note endpoints with external IDs. Those catalogue-only actions remain available for LOOP catalogue records.
- The bottom Now Playing title/artist area is a keyboard-accessible button. The official YouTube iframe is kept as a single persistent player and is repositioned above the expanded player instead of creating a duplicate iframe.
- Settings now contains a **Music sources** section. A listener can paste, save, test, show/hide, and clear a YouTube Data API v3 key there. The key is stored in that browser's local storage, not in LOOP's account database.
- YouTube search results are cached locally for 30 minutes to reduce repeated `search.list` quota use.
- Home now has a rotating worldwide spotlight using YouTube music-category thumbnails and a row of global video picks. The worldwide discovery grid covers South Asian, East Asian, African, European, Middle Eastern, Latin, rock, and electronic searches. Search's empty state offers the same broader set of regions/styles.

## Provider behaviour

- **YouTube:** metadata/search uses the listener's public browser key entered in Settings. Playback remains inside YouTube's official visible embedded player. LOOP does not extract audio, proxy, download, or re-host YouTube media. Some uploads cannot be embedded, and video results are not guaranteed to be complete songs.
- **Openverse:** anonymous audio search requires no key. LOOP uses the original HTTPS audio URL, displays creator/source/licence/attribution, and does not download, cache, proxy, or re-host audio. Full-length playback depends on the source URL and licence.
- **Spotify:** Spotify API credentials are not collected or used by this multi-source player. Spotify's Developer Policy prohibits integrating Spotify streams/content with another service. LOOP retains only an external “Open in Spotify” hand-off. A Premium account or API credentials do not override that policy.
- **Jamendo:** the existing optional integration remains disabled until a Client ID is configured server-side.

## Configure the YouTube key

1. Open LOOP and go to **Settings → Music sources**.
2. Paste the Google Cloud API key for **YouTube Data API v3**.
3. Press **Save key in Settings**.
4. Press **Test key**. A successful test confirms that Google's `videos.list` endpoint accepts the key.
5. In Google Cloud Console, restrict the key to YouTube Data API v3 and to the exact deployed LOOP website referrers. The browser key is intentionally public; do not use a private OAuth client secret here.
6. Return to Home or Search. The key is read from the same browser/device. If the key is cleared, the browser-side search fallback stops after cached results expire.

No Spotify Client Secret, access token, or OAuth refresh token belongs in frontend storage or source control.

## Validation notes

- Run `npm ci` from the repository root, then `npm run build`, `npm run test:web`, `npm test`, `npm run lint`, `npm run deploy:check`, and `npm run ui:audit` before releasing.
- The current handoff was statically checked with the dependency-free deployment preflight and UI audit. The full Vite build and Vitest/backend suites must be run in a dependency-installed environment. Live YouTube/Openverse playback depends on credentials, network availability, upload embed settings, original audio host behaviour, and licence terms.
