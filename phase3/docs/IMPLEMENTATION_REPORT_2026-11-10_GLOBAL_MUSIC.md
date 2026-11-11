# Implementation report — global music and in-page playback

Date: 10 November 2026

## Implemented in this pass

- Multi-storefront Apple catalogue search in `frontend/src/lib/appleMusic.js`.
- Global Search page merges Apple international results with the curated LOOP catalogue.
- Apple preview URLs are validated to HTTPS Apple-owned hosts before they can be assigned to the audio element.
- Official Apple previews play in the persistent LOOP audio player when the browser allows it.
- If a delayed catalogue lookup loses browser autoplay permission, or no preview exists, the official Apple embed is rendered inline above the player bar.
- Removed the Apple player popup flow.
- Apple image, preview-media, search-script and iframe hosts are allowed narrowly in the backend CSP.
- Global genre shortcuts and worldwide discovery links on Search and Home.
- Recently Played shelf on Home.
- Dark charcoal / LOOP green styling, artwork-led worldwide search rows and a persistent player layout.
- Documentation updated for the exact source-dataset and provider limitations.

## Validation performed

- `node --check` on backend source and scripts: passed.
- `node --check` on frontend JavaScript modules: passed.
- TypeScript parser JSX/TSX syntax pass: 44 files, 0 syntax errors.
- Apple Music mock integration smoke tests: passed (multi-storefront search, exact title/artist matching, safe preview URL, inline-embed fallback).
- Spotify notebook-style recommender smoke test: passed (7 available feature dimensions; nearest neighbour ranked first).
- Deployment preflight: 31 passed, 0 failed.
- ZIP integrity: passed.

## Not run / not certified

- Full Vite production build and Vitest suite: not run because frontend dependencies (including `vite` and `vitest`) are not installed in this environment.
- Live Apple Search API, preview audio and embedded-player browser test: not possible from this environment; perform the manual browser test in `GLOBAL_MUSIC_AND_PLAYBACK.md` after installing dependencies and starting the app.
- Full-length playback: controlled by Apple Music's player and subscription/territory availability. LOOP cannot legally provide every commercial recording without a licensed catalogue or the artist's permission.
- Global Apple preview/embedded plays are not yet linked to LOOP database song IDs for full listening-history and recommendation learning unless a matching catalogue song is available.

## Catalogue truth

The supplied 28,372-track LOOP archive is metadata/audio-feature data, not audio files. Global search now supplements it with Apple's public catalogue across multiple storefronts; it does not guarantee every track ever released or availability in every country. The uploaded Spotify notebook's original 15-column recommender expects additional CSV fields and Spotify API credentials not present in the upload. LOOP uses its mean-seed-vector, standardisation and cosine-distance method with the seven fields available in its own archive.
