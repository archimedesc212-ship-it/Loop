# LOOP music-app experience: product map and implementation boundary

LOOP uses familiar music-player interaction patterns (a persistent library/navigation area, artwork-led shelves, a search-first discovery flow, playlists, a queue and a docked player). It is an independently branded product. It does not contain Spotify's private source code, artwork, logos, audio files or private APIs.

## Experience map

| Music-app pattern | LOOP route / component | Current behavior |
|---|---|---|
| Home and personalized shelves | `/` · `pages/Home.jsx` | Guest-first home, mood-led recommendations and recently relevant music shelves |
| Discover by mood / context | `/mood` · `pages/Mood.jsx`, `pages/Mix.jsx` | Mood selection and text prompt; daily, similar, contextual and discovery mixes |
| Search and autocomplete | `/search` · `components/Layout.jsx`, `pages/Search.jsx` | Debounced LOOP-catalogue suggestions, keyboard navigation and full search across configured providers |
| Personal library | `/library` · `pages/Library.jsx` | Likes, local or account playlists and recent listening state according to deployment profile |
| Track, artist, album pages | `/song/:id`, `/artist/:id`, `/album/:id` · `pages/Catalog.jsx` | Metadata, credits, mood analysis and supported playback actions |
| Bottom player and queue | `components/Layout.jsx`, `hooks/usePlayer.jsx` | Play/pause, next/previous, seek, volume, repeat, shuffle, sleep timer and queue state |
| Immersive now-playing | `components/ImmersivePlayer.jsx` | Artwork-led full-screen player, visualizer and any available lyrics/annotations |
| Guest and signed-in listener | `hooks/useAuth.jsx`, `pages/AuthPage.jsx` | Guest-first startup; account creation and sign-in only when an API/database profile is enabled |
| Artist and moderation tools | `/artist/*`, `/admin/*` | Artist application/studio and permission-gated catalogue/review tools |

## Working process

1. The app boots in browser-only guest mode unless `VITE_DEMO_MODE=false` is explicitly configured.
2. The frontend's API adapter routes supported calls to browser-local demo behavior in guest mode, or same-origin `/api` requests in account-enabled mode.
3. The static build prepares the public music metadata from the checksum-pinned CC BY 4.0 source. If that upstream file is unavailable or cannot be verified, it uses the curated multilingual starter metadata and does not add a fake song.
4. Mood and similarity recommendations use available metadata/audio-feature columns; they are explainable estimates, not a claim that LOOP has analysed an audio recording.
5. Playback resolves to a permitted external provider (for example an official YouTube embed) or a search-link fallback. LOOP does not scrape, extract, proxy or re-host third-party recordings.
6. In account-enabled mode, the Express API enforces authentication, CSRF, permissions and persistence through MySQL. Vercel serverless mode disables local filesystem uploads because the function filesystem is not durable.

## Deployment profiles

| Profile | Required services | Accounts / sync | Playback / uploads |
|---|---|---|---|
| Static guest (recommended first launch) | Vercel static build; no database | Guest mode; supported preferences/playlists stay in this browser | Official-provider embeds/search fallback only; no artist audio uploads |
| Full-stack accounts | Vercel Function + compatible MySQL 8.0.19+ + secure environment variables | Optional registered accounts, server-side sessions and database-backed state | Provider-dependent playback; durable private artist uploads still require object storage and a scanning worker |

The default `VITE_DEMO_MODE` value is enabled unless the variable is set to the literal string `false`. Do not enable account mode until the database is provisioned, migrations are applied and `/api/ready` returns HTTP 200.

## Important product limits

- Spotify's private production code is not public. LOOP is independently implemented using common product patterns and public developer documentation.
- Spotify Web API metadata access is not a licence to stream commercial recordings. Its Web Playback SDK has its own account, authorization and policy requirements.
- A YouTube or Apple Music embed may be unavailable because of owner settings, territory, subscription, age restrictions or provider policy. The app must retain a clear link/search fallback and must not imply a guaranteed full-length stream.
- The current Vercel function deliberately rejects local-media upload requests. Do not enable artist uploads on ephemeral serverless storage.
- Browser-local demo data does not sync to another device or browser and is not a substitute for a database-backed account.

## Public references reviewed

- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — content metadata, search and supported playlist/playback controls.
- [Spotify Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) — safer authorization for browser-based public clients.
- [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) — official embedded Spotify Connect player requirements.
- [Spotify Design and Branding Guidelines](https://developer.spotify.com/documentation/design) — attribution and separate-product naming/branding requirements.
- [Spotify Developer Policy](https://developer.spotify.com/policy) — content attribution, developer access and usage restrictions.

This document is an implementation map and release boundary, not a claim of one-to-one parity with Spotify's private product or licensing arrangements.
