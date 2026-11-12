# Jamendo integration release notes — 2026-11-11

## Implemented

- Optional `JAMENDO` backend provider, disabled by default.
- Backend-only `JAMENDO_CLIENT_ID` configuration.
- Search adapter for Jamendo API v3 `/tracks/`, requesting licence details and MP32 stream format.
- Defensive result mapping: HTTPS stream URLs only; artist/title/duration/artwork/source/licence/attribution included.
- Authenticated `GET /api/music/jamendo?q=...&limit=...` route.
- Search page section for Jamendo independent tracks.
- Native LOOP audio player branch for Jamendo direct streams, with pause/resume/seek/queue/next/previous support through the existing HTML audio element.
- Attribution and licence links shown next to each Jamendo result.
- Jamendo media hosts added to Content Security Policy.
- Provider registry and environment documentation updated.
- Adapter tests added using mocked HTTP responses; no live Jamendo requests are made by automated tests.

## Rights and operational guardrails

- Jamendo integration is optional and off by default.
- Non-commercial API use only; ads, subscriptions, affiliate revenue or other commercial advantage require Jamendo licensing.
- Track-level Creative Commons conditions still apply.
- No offline access, downloads, caching, proxying, or re-hosting.
- Only HTTPS stream URLs are accepted.
- Jamendo search results are external catalogue tracks and are not persisted into LOOP's database or listening-history schema.

## Verification

- JavaScript syntax checks: passed for all changed backend modules and new test.
- Deployment preflight: 39/39 passed.
- Static UI release audit: 10/10 passed.
- Full Jamendo automated test execution was blocked because dependencies are not installed in this environment (`dotenv` missing). Run `npm ci`, then `node --test backend/tests/jamendo.test.js`, `npm test --workspace backend`, `npm test --workspace frontend`, `npm run lint`, and `npm run build` before production deployment.
- No live Jamendo API credential was provided, so live credentials, actual track playback, regional rights, and the Jamendo portal application approval have not been verified.
