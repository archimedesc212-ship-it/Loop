# Feature status

> This is a historical feature inventory (last edited 11 October 2026). For the current 10 November 2026 code and production-readiness audit, see [RELEASE_AUDIT_2026-11-10.md](RELEASE_AUDIT_2026-11-10.md).

Status as of 11 October 2026, schema version 0005. "Tested" means covered by an
automated test or browser check that passed in the run recorded in
[TESTING.md](TESTING.md); the column names the evidence.

| Status | Meaning |
|---|---|
| **Done** | implemented and covered by passing automated tests |
| **Partial** | works, with a limitation stated in the row |
| **Blocked** | implemented as far as possible without something only you can provide (credentials, a licence, real audio) |

## Accounts and security

| Feature | Status | Evidence / note |
|---|---|---|
| Registration, sign-in, bcrypt, lockout, no enumeration | Done | `01-auth` |
| Server-side sessions in httpOnly SameSite=Strict cookies, CSRF token, Origin check | Done | `08-sessions` 1–4, browser checks |
| Logout revokes; expired / revoked / inactive sessions refused | Done | `08-sessions` 5–8 |
| Sessions list, sign out device, sign out everywhere | Done | `08-sessions` 9, browser checks |
| Change password (signs out other devices) | Done | `08-sessions` 10, browser checks |
| Delete account | Done | `08-sessions` 11–12, browser checks |
| RBAC from the database on every request; admin deactivation revokes sessions | Done | `06-admin`, `08-sessions` 13 |
| Rate limiting, trusted proxies, security headers, no-store | Done | `08-sessions` 15; limits in memory per process (see SECURITY known gaps) |
| Least-privilege DB account, append-only audit log, parameterised SQL | Done | `06-admin`, `07-database`, `01-auth` (injection) |
| MFA, email verification, password reset by email | Not implemented | no mail service in scope |

## Catalogue, search, onboarding

| Feature | Status | Evidence / note |
|---|---|---|
| Songs, artists, albums pages | Done | `02`, browser tour |
| Film (soundtrack) page | Done | `10-product` 6, browser checks |
| Language / regional page | Done | `10-product` 7, browser checks |
| Search (FULLTEXT ngram, aliases, sound-alike, noise filter, empty / long input) | Done | `02`, `10-product` 8 |
| Onboarding: languages, genres, artists, composers & film music, moods & moments, region; editable; not repeated | Done | `01-auth`, `10-product` 11, browser checks |
| Favourites (likes), ratings, playlists (manual, saved, 8 smart types) | Done | `03`, `04` |

## Recommendations and MUSE Worlds

| Feature | Status | Evidence / note |
|---|---|---|
| Local, explainable engine (8 configurable base signals, stored reasons, cold start) | Done | `02`, `06-admin` (weights) |
| Similar-listener collaborative boost for Daily, Regional, Discovery and Similar mixes | Implemented | 180-day completed-play overlap; requires ≥2 similar listeners; confidence-weighted boost capped at 12%; private sessions excluded |
| Recommends playable songs only | Done | `10-product` 1 |
| "Not for me" feedback, undo | Done | `10-product` 3, browser checks, component test |
| Free-text mood parsing (local, deterministic) | Done | `02` |
| Optional AI fallback for unknown mood text | Blocked (credentials) | implemented and tested against a mock (`09-providers` 14–15); not run against the real Anthropic API |
| Weekly MUSE World: generation, evidence, versions, rollback | Done | `07-database`, `10-product` |
| World feedback ("Love this world" / "Not for me") shaping later worlds | Done | `10-product` 4, browser checks |
| Failed refresh keeps the current world | Done | `10-product` 5 |
| Scheduled weekly refresh | Partial | runs from the in-process scheduler **only while the API runs** with `JOBS_ENABLED=true`; there is no external cron. Manual refresh ("New version") always works |

## Playback

| Feature | Status | Evidence / note |
|---|---|---|
| Player: play/pause, seek, next/previous, queue panel, play next, volume/mute | Done | browser checks (queue, volume), `03` (events) |
| Playable vs metadata-only, honest labels, no invented URLs | Done | `10-product` 1, component test, browser checks |
| Demo sketch (labelled fixture) | Done | it is not the recording, by design |
| Licensed local files with range streaming, availability check | Done | `10-product` 2 (no real music bundled; a generated WAV is used in the test) |
| Licensed preview provider (by ISRC) | Blocked (licence + credentials) | contract implemented, tested against a mock (`09-providers` 13) |
| Full-track streaming from a commercial service | Not implemented | would need a licensed provider and its SDK/terms; no scraping or DRM bypass |

## Private listening

| Feature | Status | Evidence / note |
|---|---|---|
| Private sessions enforced by API and trigger; temporary memory purged | Done | `05-incognito` (14-table snapshot) |
| Ratings, likes, "Not for me", world feedback, AI text paused in private sessions | Done | `05`, `10-product` 3–4, `09-providers` 14 |

## Providers and data pipeline

| Feature | Status | Evidence / note |
|---|---|---|
| Provider framework: timeouts, retries, rate spacing, safe errors, status, disabled state | Done | `09-providers` 1–8 |
| MusicBrainz adapter + ingestion pipeline | Blocked (contact User-Agent, network) | pipeline with the file feed is Done (`06-admin`); MusicBrainz tested against a mock only |
| TMDB film enrichment | Blocked (credentials) | tested against a mock (`09-providers` 10–11); TMDB logo still to be added before public use |
| YouTube Data API links | Blocked (credentials) | tested against a mock (`09-providers` 12) |
| Admin › Providers & media page | Done | browser checks |
| TheAudioDB artist artwork lookup | Partial | backend adapter, cache, attribution, provider status/test and artist/album artwork endpoints; real provider test remains credential/terms dependent |
| Kaggle 1950–2019 feature dataset import | Partial | separate CC BY 4.0 staging table and batch importer; not used by the current recommendation scorer and contains no playable audio |
| Ingestion, provenance, review queue, idempotent jobs | Done | `06-admin`, `07-database` |

## Database and operations

| Feature | Status | Evidence / note |
|---|---|---|
| Normalised schema, constraints, triggers, procedures, views | Done | `07-database`, `test:sql` |
| Versioned migrations with checksums; upgrade = fresh install | Done | `db:verify` |
| Empty catalogue | Done | `tests/empty` via `db:verify` |
| Readiness / liveness endpoints | Done | `08-sessions` 14, `10-product` 9 |
| Database outage → 503 with safe message | Done | `10-product` 9 |
| Backup and recovery procedure | Partial | documented in [DEPLOYMENT.md](DEPLOYMENT.md); not rehearsed automatically |

## UI quality

| Feature | Status | Evidence / note |
|---|---|---|
| Cinematic intro with skip, keyboard and reduced-motion support | Done | component tests, browser checks |
| Loading, empty, error and offline states | Done | component tests, browser checks |
| Responsive layout (390 px phone, tablet, desktop) | Done | browser checks |
| Keyboard access (skip link, Escape closes dialogs/queue, labelled controls) | Partial | automated checks pass; no manual screen-reader review was done |
| Automated accessibility (axe-core WCAG 2.1 A/AA) | Done | 0 violations on 10 screens |

## Limitations

- Audio features are pre-computed values in the seed and feed; no signal-processing model analyses real audio.
- Public static archive mode now uses the uploaded 28,372-record CC BY 4.0 dataset for real track metadata and audio-feature matching; its lyrics column is excluded. The archive has no audio recordings or stream URLs, so playback remains disabled. The separate MySQL development/integration seed is still fictional and is not served by the static archive.
- Collaborative matching is request-time and requires at least two completed shared tracks plus at least two similar listeners; new/low-history users continue to rely on onboarding, regional and trend signals.
- Single process and single MySQL instance; rate limits are per process; no load testing.
- Chromium only in browser tests.
- Provider integrations are untested against the real services until credentials are supplied — follow the checklist in [PROVIDERS.md](PROVIDERS.md).
