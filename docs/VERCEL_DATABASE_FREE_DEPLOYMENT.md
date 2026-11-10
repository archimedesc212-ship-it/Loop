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
