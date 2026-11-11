# Audit of the existing MUSE project (11 Oct 2026)

This is the state of the project **before** the finalisation pass, as found and
measured from the delivered ZIP on a fresh Ubuntu 24.04 + MySQL 8.0.46 + Node 22
machine. What changed afterwards is in [CHANGELOG.md](CHANGELOG.md); the current
status of every feature is in [STATUS.md](STATUS.md).

## Checks run before any change

| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | OK |
| Database build | `npm run db:setup` | OK, 7.8 s (schema, routines, triggers, grants, seed, first weekly pipeline) |
| Web build | `npm run build` | OK |
| API + database tests | `npm test` | 61 / 61 passed |
| SQL query file | `npm run test:sql` | 42 / 42 blocks passed |
| Dependency audit | `npm audit` | **6 vulnerabilities**: `shell-quote` (critical, via `concurrently`, dev only), `react-router` open-redirect advisories (moderate, shipped to browsers), `esbuild`/`vite` dev-server advisory (moderate, dev only) |
| Lint | — | no linter configured |
| Frontend tests | — | none |

## What already worked (verified)

Relational schema (59 tables), routines, triggers and least-privilege grants;
authentication with bcrypt, lockout and RBAC; onboarding; mood/text/context
recommendations with stored score breakdowns and reasons; playback recording with
derived completion/skip/replay; ratings, likes, manual and smart playlists; search
(FULLTEXT ngram + aliases); listening profile and Music Mood Journey; private
sessions enforced by API and trigger; MUSE Worlds with versions and rollback;
ingestion pipeline with idempotency, provenance and review queue; admin catalogue,
models, users, health, performance lab and audit log; scheduler; docs.

## Gaps against the finalisation brief

| Area | Finding |
|---|---|
| Sessions | JWT kept in `localStorage`; logout did not invalidate the token server-side; no session list, no expiry enforcement beyond the JWT itself |
| CSRF / cookies | not applicable to bearer tokens, but required once sessions move to cookies |
| Account management | no password change, no "sign out everywhere", no account deletion |
| Dependencies | 6 audit findings (above) |
| Migrations | only "drop and recreate" (`db:setup`); no way to upgrade an existing database |
| Readiness | `/api/health` only; no readiness check covering schema version and providers |
| Providers | MusicBrainz adapter only (no retry, no rate-limit budget per provider, no tests); TMDB registered but no adapter; no YouTube metadata adapter; no playback-provider abstraction; no optional AI adapter; no provider status view |
| Playback | every song had a generated sketch, so "playable" vs "metadata-only" was never visible; player had no queue view and no volume control |
| Product | no introduction sequence; no film (soundtrack) page; no language/regional page; onboarding did not ask about composers / film music; no offline state; MUSE World had no feedback mechanism |
| Quality | no lint, no frontend unit/component tests, no automated accessibility check, no tests for database-down, empty catalogue, provider timeout, expired/revoked session, failed world refresh |
| Docs | no environment-variable reference, provider integration guide, deployment/backup guide, credentials checklist or implemented/tested/blocked matrix |

## Deliberately not added

A message queue, Redis, a separate worker service, a search engine, an ORM, a CSS
framework or a component library: none is needed at this scale, and each would add
setup cost for a student demo. Real audio files and scraped metadata are excluded for
licensing reasons.
