# LOOP V9 — Now Playing refresh

- Reworked the expanded Now Playing screen into an Apple Music-inspired layout: large square cover art (with LOOP artwork fallback), track/artist metadata, playback status, prominent transport controls, progress, and lyrics/notes panel.
- Added an official YouTube iframe surface inside the expanded player when an embeddable video is found.
- Added a visible YouTube search fallback in both expanded and compact player views when no embeddable upload is returned.
- Kept YouTube playback on the official iframe; no audio extraction or proxying.

## Vercel
Keep `VITE_DEMO_MODE=true`. For the browser-side YouTube search fallback, open **Settings → Music sources**, paste the public YouTube Data API v3 key, save and test it. No build-time `VITE_` variable or redeploy is required. Restrict the key in Google Cloud to YouTube Data API v3 and the deployed site's HTTP referrers.

## Validation
- 28 plain JavaScript files passed `node --check`.
- Static UI release audit passed 9/9.
- ZIP integrity checked after packaging.
- A full Vite production build was not verified in this environment because dependency installation timed out. Verify the Vercel build log after deployment.
