# Vercel database-free deployment

LOOP now defaults to its browser-local catalogue/demo adapter unless
`VITE_DEMO_MODE=false` is explicitly set at build time. No MySQL connection,
database URL, or API server is required for the static Vercel experience.

## Vercel settings
- Framework preset: Other (or Vite)
- Root directory: repository root (the folder containing `vercel.json`)
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `frontend/dist`
- Environment variable: `VITE_DEMO_MODE=true` (optional; this is now the default)

Do not set `VITE_DEMO_MODE=false` unless you have separately deployed and
configured the Express API and database.

## Behaviour and limitations
- Catalogue browsing, local likes/ratings and preferences use this browser's
  local storage.
- User data is local to each browser/device and is not synchronised.
- Account, admin, and server-persistent features are not available in this mode.
- The catalogue metadata is prepared at build time from the checksum-pinned
  upstream source by `scripts/prepare-music-catalog.js`. Vercel build needs
  outbound access to that source. Audio playback depends on the supported
  official provider links/embeds; this project does not host music files.

## Startup crash fix
User session data is now treated as nullable during initial load. Components
that inspect private/incognito state no longer dereference `user` before the
guest/demo session is available.

## Embedded YouTube playback in database-free mode (V8 patch)

For Vercel deployments using the browser-only catalogue, paste the public YouTube Data API v3 key in **Settings → Music sources** (the legacy `VITE_YOUTUBE_API_KEY` build variable is no longer required)
to a Google Cloud API key with **YouTube Data API v3** enabled. Restrict the key
to the YouTube Data API and HTTP referrers for your deployed domain(s). This
variable is bundled into browser code, so it is public; never use an unrestricted
server credential here. Redeploy after adding it. Without this key, LOOP can show
catalogue metadata but cannot resolve a YouTube video ID for the embedded player.
LOOP uses YouTube's official iframe embed and does not extract or proxy audio.
