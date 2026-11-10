# Cloudflare Workers deployment

This repository is a monorepo. The public Cloudflare Worker serves the built React/Vite frontend as static assets.

## Workers Builds settings

Connect the repository root (do not set the root directory to `frontend`).

| Setting | Value |
| --- | --- |
| Root directory | repository root / blank |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview deploy command | `npx wrangler preview` |

The dependency install step should run from the repository root with the root `package-lock.json`. Do not use `npx wrangler pages deploy` in a Workers project.

The root `wrangler.jsonc` is the Worker configuration. It publishes `frontend/dist` and enables the React single-page-app fallback. This also prevents Wrangler from trying to auto-detect a framework in the root npm workspace.

## What this deployment contains

The frontend uses the verified, static music archive prepared at build time from the supplied 28,372-record Music Dataset (1950–2019). The root build script checksum-verifies the source CSV, excludes the lyrics column, and writes `frontend/public/data/music-catalog.json` before Vite runs. The Worker remains database-free and does not need `VITE_DEMO_MODE=false`.

This is a public, dataset-backed music archive, not the database-backed streaming API. The source contains track metadata and audio features, but no original recordings, track durations, language labels, album metadata or film metadata. Playback remains disabled; song pages can open an external search for a recording. The Express/MySQL API is not converted into a Cloudflare Worker by this configuration. Do not connect the current backend to TiDB: the application uses MySQL stored procedures, stored functions and triggers, which TiDB does not support. Use a compatible MySQL 8.0.19+ service and a separately deployed API before switching the frontend out of demo mode.

## Release check

After the production build completes, open the Worker's `workers.dev` URL and verify:

- The LOOP home screen loads instead of the default Hello World response.
- Refreshing a nested route returns the app rather than a 404.
- The demo can navigate and retain demo-only preferences in that browser.

If the dashboard says no URLs are enabled, open Worker **Settings → Domains & Routes** and enable its `workers.dev` domain. Keep the existing Worker; no delete/recreate is needed.
