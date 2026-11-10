# LOOP screenshot review — fixes in this release

Date: 10 November 2026

## What changed

1. **Home featured-song banner:** it is the first Home section. It rotates through embeddable YouTube videos when configured and falls back to tracks from the listener's daily mix / Popular in LOOP when YouTube search is not configured or returns no image-backed results. The fallback artwork is generated from LOOP's own palette rather than copied artwork.
2. **Discover mood tiles:** each mood tile has its own colour treatment, orbit artwork, emoji tile, and short description. Selected/focus states remain visible on dark backgrounds.
3. **Apple preview failure:** every Apple preview error (browser permission, media load, network/CDN or unsupported format) now switches to Apple's official embedded player when the catalogue result contains a valid Apple Music embed URL. The player no longer raises the red preview-load toast for those preview failures. Apple Music subscription requirements still apply for full-track playback.
4. **Movie-title search:** local LOOP film titles return linked soundtrack songs. When TMDB is configured, search also resolves external movie titles; choosing a movie re-runs Apple Music, YouTube and MusicBrainz searches using the movie's soundtrack title. TMDB supplies movie metadata, not soundtrack recordings or audio. A TMDB poster, when present, is loaded from TMDB's image CDN.
5. **Search field and suggestions:** search uses explicit white text/caret on charcoal, white placeholder contrast, and local song/artist/album/film suggestions with keyboard selection. Provider searches occur after submit, not on each typed character.

## Optional TMDB configuration

Add to the Vercel backend/server environment (not a `VITE_` variable):

- `TMDB_ENABLED=true`
- `TMDB_READ_ACCESS_TOKEN=<your TMDB API Read Access Token>`

Alternatively use `TMDB_API_KEY`. Keep credentials server-side. TMDB requires an approved logo and the notice: “This product uses the TMDB API but is not endorsed or certified by TMDB.” LOOP displays its TMDB logo and notice in Settings → About and credits. Non-commercial use requires attribution; a commercial product needs a TMDB licence. See `docs/PROVIDERS.md` and the official TMDB FAQ.

## Playback limitations

- Apple Music preview URLs are short promotional samples (typically around 30 seconds). If preview playback fails, LOOP shows Apple's official embedded player; full playback can require an Apple Music subscription.
- YouTube results play only through the official YouTube embed. Duration is the uploaded video's real duration; duration alone cannot prove that a video is a complete song. Some uploads restrict embeds or regions.
- LOOP does not download, extract, proxy, or re-host YouTube audio.

## Validation note

This release was checked with source syntax parsing, route/provider inspection, search-suggestion mapping checks, and ZIP integrity. A full Vite/Vitest build, live TMDB/YouTube/Apple request, and browser interaction check still require dependencies, credentials, and the deployed environment.

## Follow-up layout refinement

- The Apple Music fallback iframe panel is aligned to the main content edge (not underneath the desktop sidebar), and sits directly above the desktop/mobile player docks with safe-area spacing on mobile.
- The white search field visible in the supplied screenshots belongs to the previously deployed build. The latest source sets the search control surface to charcoal with white typed text/caret and follows the current URL query when navigating to results. Redeploy this release to see the updated field.
- The missing Home banner in the supplied screenshot is addressed by rendering the featured-song section as the first Home section, with an online YouTube thumbnail when available and daily-mix/generated-art fallback otherwise.
- Home no longer renders a large empty-state panel for a listener with no recent-play history; the Recently played shelf appears after the first play. This keeps the featured banner and available music shelves in the visual flow.

## Final source checks for this hand-off

- Backend source/script JavaScript syntax: 88 files passed `node --check`.
- Frontend source syntax: 70 JavaScript/JSX/TypeScript files parsed with zero syntax diagnostics.
- Dependency-independent backend tests: 37 passed, 0 failed (artist upload validation, mood diary dates, backup/restore tooling, playlist ordering, recommendation logic, runtime capabilities, TMDB mapping, Vercel entrypoint and YouTube duration/embeddability).
- Static responsive/accessibility release audit: 9/9 passed.
- Deployment contract preflight: 39/39 passed.
- Search autocomplete mapper: song, artist, album and movie suggestion cases verified.
- CSS brace-balance check: passed.

**Not verified:** the full Express/MySQL integration suite could not start because npm dependencies are unavailable (`express` is missing); Vite/Vitest production build and browser tests were not run. Live YouTube, Apple Music and TMDB requests need deployed credentials/network access. The `TMDB_ENABLED` and token/key configuration is optional; without it, users can still search LOOP's film table and send movie-name searches to the configured YouTube/music providers, but there will be no external movie candidate cards.
