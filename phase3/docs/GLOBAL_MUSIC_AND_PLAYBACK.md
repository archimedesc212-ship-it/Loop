# LOOP global music search and in-page playback

## What changed

- Search now combines the existing curated LOOP catalogue with Apple's public music catalogue.
- Global search queries multiple Apple storefronts (the listener's locale plus international storefronts) and deduplicates track IDs.
- Each result includes real Apple catalogue metadata and artwork when supplied by Apple.
- When Apple supplies an official short preview URL, LOOP plays that preview with an HTML audio element in the site's persistent player. The preview is not downloaded or re-hosted.
- When no preview is available, LOOP renders Apple's official embedded player inline above the persistent player bar. It no longer requires a modal or a separate tab to start playback.
- Search landing page and Home include quick entry points for Bollywood, K-pop, Afrobeats, Latin pop, Arabic pop, Japanese pop, global hits and classic rock.
- Home includes recently played, made-for-you and popular shelves.
- The Spotify notebook's feature-centroid/cosine-similarity method remains the basis for the curated LOOP recommendation catalogue; global Apple catalogue search is a complementary discovery source.

## Important catalogue and playback limits

- The public Apple Search API is a catalogue search, not a guarantee of every recording in every country. Storefront licensing, regional availability and provider indexing affect results.
- Apple preview availability varies by track and territory. Where supplied, the preview is typically about 30 seconds and plays directly inside LOOP.
- Full-length Apple Music playback is controlled by Apple's embedded player and may require an Apple Music subscription and a supported territory/account.
- LOOP does not scrape audio, extract audio from videos, bypass subscriptions, download copyrighted recordings, or fabricate playable URLs.
- Full-length independent playback requires artist-owned/licensed uploads or a licensed streaming provider with the appropriate rights.
- Apple catalogue playback is external-provider playback; the Apple embed does not expose detailed listening telemetry to LOOP. Direct preview listening time is available to the browser player, but global Apple track events are not yet linked to the LOOP database's song IDs unless a matching catalogue record is available.

## Browser security policy

The backend Content Security Policy allows only the required Apple endpoints for JSONP catalogue lookup, Apple artwork, official embeds and official preview audio. It does not enable arbitrary third-party scripts, frames or media hosts.

## Test manually

1. Run `npm install` from the project root.
2. Configure the backend database and session environment using `.env.example`.
3. Run `npm run dev`.
4. Open Search and search for a known title and artist (for example, `Creep Radiohead`).
5. In Worldwide music, click a track marked `30-second preview`; it should play through the bottom LOOP player without leaving the page.
6. For a track without a preview, the inline Apple player should appear above the bottom player bar. Press Play inside that embedded player.
7. Try searches for Bollywood, K-pop, Afrobeats, Latin pop and Japanese pop to exercise different storefronts.

## Automated tests

`frontend/src/lib/appleMusic.test.js` covers Apple URL validation, exact title/artist matching, preview URL validation, artwork mapping and multi-storefront deduplication. Run with `npm run test:web --workspace frontend` after dependencies are installed.
