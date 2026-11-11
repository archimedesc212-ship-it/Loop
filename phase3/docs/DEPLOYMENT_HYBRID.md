# Legacy hybrid deployment note (Vercel + Render)

> **Not the active production runbook.** The checked-in `vercel.json` now routes `/api/*` to the Vercel Node Function in `api/index.js`, not to a Render hostname. For the active architecture and exact release steps, use [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md).

This file is retained as historical documentation for a possible Vercel frontend + persistent Render API alternative. Do not follow it while the internal Vercel API rewrite is active; mixing the two topologies causes confusing API routing, cookie and scheduler behaviour.

If the project is intentionally moved back to the hybrid topology, an operator must separately review and update `vercel.json`, set exact `CORS_ORIGIN`, provision an appropriate persistent media volume or private object store, maintain one scheduler instance, and run all auth, CSRF, database, media and restore gates. Never run `npm run db:reset:unsafe` against an existing database. Keep Render auto-deploy disabled until migrations, environment values and health checks are reviewed.
