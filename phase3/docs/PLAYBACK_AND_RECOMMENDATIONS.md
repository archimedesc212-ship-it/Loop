# Music playback and recommendation integration

## Recommendation method from the supplied Spotify notebook

The attached notebook builds a Spotify recommender by averaging the feature vectors of seed tracks, standardising the catalogue with the fitted `StandardScaler`, then ranking candidates by cosine distance. The notebook's original vector contains 15 fields: valence, year, acousticness, danceability, duration, energy, explicitness, instrumentalness, key, liveness, loudness, mode, popularity, speechiness and tempo. It also calls the Spotify Web API (Spotipy) to look up seed songs missing from the CSV.

LOOP ports the same seed-centroid + standardisation + cosine-distance method in `frontend/src/lib/spotifySimilarity.js`. The current 28,372-track archive does not contain all 15 notebook fields, so LOOP uses the fields that actually exist: energy, valence, danceability, acousticness, instrumentalness, normalised loudness and release year. The notebook's referenced Spotify CSVs and Spotify API credentials were not included in the upload; LOOP therefore does not claim to run the notebook's exact original 15-column dataset or call Spotify's API. The method is used for Similar Sound and the daily mix when a listener has liked-song seeds in the browser/demo recommendation path. The database-backed service continues to use LOOP's multi-signal SQL recommendation engine.

## How songs play in LOOP

- Global Search uses Apple's public Search API across the listener's locale and multiple international storefronts. Results include official track metadata and artwork where Apple provides them.
- When Apple provides an official preview URL, LOOP plays it directly in the site's persistent HTML audio player. The preview is typically about 30 seconds and is not downloaded or re-hosted.
- When a preview is unavailable, LOOP displays Apple's official embedded player inline above the persistent player bar. The user does not need to open a popup or leave LOOP to press Play.
- Apple catalogue lookup is matched by both title and artist. Loose matches are rejected rather than silently playing a different recording.
- The player controls, progress and volume operate directly for HTML audio previews and licensed/local artist uploads. Apple's embedded player exposes its own controls for full-track playback.

## Important catalogue and playback limits

- The public Apple Search API is a catalogue search, not a guarantee of every recording in every country. Storefront licensing, regional availability and provider indexing affect results.
- Apple preview availability varies by track and territory. Full-length Apple Music playback is controlled by Apple's embedded player and may require an Apple Music subscription and supported territory/account.
- The original 28,372-track LOOP archive is metadata and audio-feature data, not a bundle of sound recordings. It does not include the actual audio, duration or language labels.
- LOOP does not scrape audio, extract audio from videos, bypass subscriptions, download copyrighted recordings, or fabricate playable URLs.
- Full-length independent playback requires artist-owned/licensed uploads or a licensed streaming provider with appropriate rights.
- Apple embedded playback does not expose detailed listening telemetry to LOOP. Direct preview listening time is available to the browser player, but global Apple track events are not yet linked to LOOP's database song IDs unless a matching catalogue record is available.

## Browser security policy

The backend Content Security Policy allows only the required Apple endpoints for JSONP catalogue lookup, Apple artwork, official embeds and official preview audio. It does not enable arbitrary third-party scripts, frames or media hosts.

## Manual browser test

1. Run `npm install` from the project root.
2. Configure the backend database and session environment using `.env.example`, or use the configured demo mode.
3. Run `npm run dev`.
4. Open Search and search for a known title and artist (for example, `Creep Radiohead`).
5. In Worldwide music, click a track marked `30-second preview`; it should play through the bottom LOOP player without leaving the page.
6. For a track without a preview, the inline Apple player should appear above the bottom player bar. Press Play inside that embedded player.
7. Try searches for Bollywood, K-pop, Afrobeats, Latin pop and Japanese pop to exercise different storefronts.
8. Like several songs, then check Made for You / Similar Sound to use the notebook-style feature-centroid recommender in demo mode.

## Official provider documentation

- [Apple Music Marketing Tools — Embeddable Player](https://artists.apple.com/support/1117-apple-music-marketing-tools)
- [Apple Music API](https://developer.apple.com/documentation/AppleMusicAPI)
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html)
