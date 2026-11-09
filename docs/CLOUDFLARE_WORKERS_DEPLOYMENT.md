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

The frontend currently defaults to its built-in presentation/demo mode unless the build variable `VITE_DEMO_MODE=false` is explicitly set. In demo mode, the UI uses browser-local sample data and does not require an API server or database. Do not set `VITE_DEMO_MODE=false` for this static Worker deployment.

This is a working public UI/demo deployment, not the database-backed production API. The Express/MySQL API is not converted into a Cloudflare Worker by this configuration. Do not connect the current backend to TiDB: the application uses MySQL stored procedures, stored functions and triggers, which TiDB does not support. Use a compatible MySQL 8.0.19+ service and a separately deployed API before switching the frontend out of demo mode.

## Release check

After the production build completes, open the Worker's `workers.dev` URL and verify:

- The LOOP home screen loads instead of the default Hello World response.
- Refreshing a nested route returns the app rather than a 404.
- The demo can navigate and retain demo-only preferences in that browser.

If the dashboard says no URLs are enabled, open Worker **Settings → Domains & Routes** and enable its `workers.dev` domain. Keep the existing Worker; no delete/recreate is needed.
