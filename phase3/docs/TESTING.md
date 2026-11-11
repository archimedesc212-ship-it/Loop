# Testing

## Summary of the latest run (11 Oct 2026, fresh install)

Environment: Ubuntu 24.04, Node.js 22.22, MySQL 8.0.46, Chromium (Playwright).
The project was copied **without** `node_modules`, `.env`, `frontend/dist` or
screenshots into an empty folder, `.env` was created from `.env.example`, and every
command below was run there. Raw outputs were kept for each step.

| # | Suite | Exact command | Result |
|---|---|---|---|
| 1 | Install | `npm ci` | OK, 0 vulnerabilities reported |
| 2 | Database build + web build | `npm run setup` | baseline 01–06 → seed → migrations 0001–0003 → "schema version 0003" → first weekly pipeline (trends and worlds COMPLETED) → Vite build OK; 13 s |
| 3 | Lint | `npm run lint` (`eslint .`) | 0 problems |
| 4 | API + database tests (`node:test`, real MySQL, no mocks of the database) | `npm test` | **104 / 104 passed**, 0 failed, 0 skipped; 38 s |
| 5 | Frontend unit + component tests (Vitest, jsdom) | `npm run test:web` | **25 / 25 passed** in 5 files |
| 6 | SQL collection, as the least-privilege app account | `npm run test:sql` | **47 / 47 blocks passed** |
| 7 | Migrations + empty catalogue (throw-away database) | `npm run db:verify` | baseline built (0000) → 3 migrations applied → upgraded structure identical to a fresh install (columns, indexes, constraints, views, routines, triggers, grants) → re-run is a no-op → no checksum problems → catalogue emptied → **4 / 4 empty-catalogue tests passed**; 11 s |
| 8 | Dependency audit | `npm audit` | 0 vulnerabilities |
| 9 | Migration status | `npm run db:status` | baseline + 0001, 0002, 0003 applied, nothing pending |
| 10 | Browser checks + accessibility (API in `NODE_ENV=production`) | `python3 e2e/finalisation.py` | **43 / 43 checks passed**; axe-core WCAG 2.1 A/AA: 0 violations of any impact on 10 screens; 0 console errors; 0 server errors |
| 11 | Browser walk-throughs | `python3 e2e/listener_tour.py`, `new_listener.py`, `admin_private_devices.py` | all three: no console errors, no 5xx; no horizontal overflow on a 390 px phone |

Not re-run in this pass (unchanged code, results from the previous run): `npm run
demo:concurrency` and `npm run demo:explain`.

What these results do **not** show: no test talks to the real MusicBrainz, TMDB,
YouTube, a preview provider or Anthropic (no credentials were used; adapters are
tested against a local mock server); no load or penetration testing; browsers other
than Chromium were not tested; the accessibility scan is automated and does not
replace a manual screen-reader review.

Tests create their own users, so they can be run repeatedly and in any order on the
same database; run `npm run db:setup` first for a clean baseline. The API tests use
bearer mode (`X-Auth-Mode: bearer`); the browser cookie and CSRF flow has its own
tests in `08-sessions.test.js` and in the browser checks.

## Test strategy

| Level | What is checked | How |
|---|---|---|
| Database | constraints, triggers, procedures, functions, versioning, privileges | SQL issued through the app account inside `07-database.test.js`, `05-incognito.test.js`, `06-admin.test.js` |
| API | contract, validation, status codes, permissions, transactions | HTTP calls to the real Express app on a random port |
| Behaviour | recommendations react to moods, contexts, feedback and weights | assertions on ranked lists and stored scores |
| Concurrency | no lost updates, no duplicate positions, no deadlocks | parallel requests in the suite, two-connection experiments in the demo |
| Providers | timeouts, retries, rate limits, bad credentials, bad responses, idempotent imports, fallbacks | adapters pointed at a local mock HTTP server (`09-providers.test.js`); no real external requests |
| Failure handling | database outage, failed world refresh, missing media files | the pool or a service function is replaced for one test and restored |
| Empty data | a catalogue with no songs, artists or users | `tests/empty/` run by `npm run db:verify` |
| Frontend units | API client (CSRF header, 401 handling, offline signal), intro, track list states, shared UI | Vitest + Testing Library in jsdom |
| UI | the main journeys work end to end, responsive layout, keyboard access, WCAG A/AA rules | Playwright scripts with console and HTTP error capture, axe-core |

## Test cases

Expected result is the assertion in the test; **all passed** in the run above.

### 01 — Authentication and onboarding (`tests/01-auth.test.js`)

| # | Case | Expected |
|---|---|---|
| 1 | Register a new account | 201 + token; password stored as bcrypt `$2b$10$…`, never plain |
| 2 | Duplicate username; invalid username/email/password/display name | 409 `USERNAME_TAKEN`; 400 `VALIDATION_ERROR` with a message for each of the four fields |
| 3 | Login by username and by email; wrong password; unknown user | 200, 200, 401 `INVALID_LOGIN`, and the same message for unknown users (no enumeration) |
| 4 | Five wrong passwords | 5th attempt 429 `ACCOUNT_LOCKED`; the correct password is also refused while locked |
| 5 | No token; forged token | 401; 401 `TOKEN_INVALID` |
| 6 | Account deactivated after login | next request 401 |
| 7 | `' OR 1=1 -- ` as login; `'; DROP TABLE songs; --` as search | 401; search 200 and `songs` still populated |
| 8 | Onboarding | onboarded flag set; preferences 100 % from onboarding; chosen genre scored > 0.9 |

### 02 — Recommendations and search (`tests/02-recommendations.test.js`)

| # | Case | Expected |
|---|---|---|
| 9 | Pick Calm + Dreamy, limit 15 | 15 songs, ordered by score, each with ≥ 1 reason and 8 signal scores; 15 rows in `recommendation_items` |
| 10 | Parse "not happy, need something calm for studying"; ask "something energetic" | Calm included, Happy not ("low mood"), context STUDY; energy target ≥ 0.7, tempo ≥ 100, top 5 energy ≥ 0.6 |
| 11 | Unknown mood id; gibberish text; empty body | 400 `INVALID_MOOD`; 422 with suggestions; 400 |
| 12 | Study context | average instrumentalness > 0.6, every song speechiness < 0.25 |
| 13 | Daily mix of 25 | no artist more often than `artist_cap` |
| 14 | Discovery for a listener with ~300 plays | none of the songs in their history |
| 15 | FAMILY content filter, "angry and energetic", 40 songs | no explicit song, all rated ALL |
| 16 | Rate the top song 1★; like another | the 1★ song disappears; "Because you liked" uses the liked song as seed and excludes it |
| 17 | Change `w_trend` to 1 | ranking changes (then restored) |
| 18 | Daily, regional, recovery, world, own `/recommendations/:id`; someone else's | 200 ×5; 403 |
| 19 | Search "vennela", "calm", "a"; unknown song/artist | matches by title and mood; 400 for one character; 404s |
| 20 | 12 simultaneous recommendation requests for one user | all 200 (regression test for the deadlock in [CONCURRENCY.md](CONCURRENCY.md); fails 3/3 without the fix) |

### 03 — Playback, feedback and insights (`tests/03-playback-feedback.test.js`)

| # | Case | Expected |
|---|---|---|
| 21 | Start → pause → finish full length | completed, not skipped, 100 %; events PLAY_STARTED, PAUSE, COMPLETED; session plays 1 and listen time = duration |
| 22 | Finish after 10 s | skipped; completion % computed by the database |
| 23 | Replay a finished song | `isReplay` true |
| 24 | Finish twice; another user finishes my play; listened > duration; SEEK without target; change a play's user via SQL | 409 `PLAY_FINISHED`; 404; 400 (trigger); 400; rejected "immutable" |
| 25 | Unknown song; hidden song; explicit song for a FAMILY listener | 404; 409; 403 `CONTENT_FILTERED` |
| 26 | A play updates preferences | genre play count +1, short-term score > 0, "learned" in the response, play in history |
| 27 | Ratings | 6★ → 400; POST twice → 409 `DUPLICATE_RATING`; PUT changes it and the song average matches SQL; DELETE twice → 200, 404; rating 0 via SQL fails the CHECK |
| 28 | Like twice; unlike | one row; listed; removed |
| 29 | Insights after two plays | totals 2 plays / 1 song; activity, journey, preferences, analytics 200; someone else's analytics 403 |
| 30 | Timestamp format | `playedAt` is ISO-8601 UTC (`…Z`) and equals "now" — passes with `DB_TIMEZONE` +00:00, +05:30 and −08:00 |

### 04 — Playlists (`tests/04-playlists.test.js`)

| # | Case | Expected |
|---|---|---|
| 31 | Create with 3 songs; create with a bad song id | count 3, length = sum of durations, positions 1-2-3; 404 and no playlist left behind (rollback) |
| 32 | Same song twice; same name twice; duplicate ids in one request | 409 `DUPLICATE_PLAYLIST_SONG`; `DUPLICATE_PLAYLIST`; 409 |
| 33 | 4 concurrent adds | positions exactly 1–4, count 4 |
| 34 | Rename, remove a song, delete | name changed; count and length follow; songs cascade-deleted |
| 35 | Another user reads, deletes, adds to my playlist | 404 ×3 |
| 36 | Save a generated list; another user saves it | SAVED_MIX in rank order; 404 |
| 37 | Smart playlists | ≥ 8 types; STUDY list saves as SMART/STUDY; MOST_REPLAYED is refused before any replay and contains the replayed song after; unknown type 400 |

### 05 — Private sessions (`tests/05-incognito.test.js`)

| # | Case | Expected |
|---|---|---|
| 38 | Busy private session: 6 plays, a skip, `/history`, search, recommendations, daily mix, profile, world; attempted rating, like, playlist, regenerate world | private flags on plays; writes refused with 409; temporary memory has 7 events; **14 permanent tables byte-for-byte identical** to before |
| 39 | Raw `INSERT INTO listening_history` during a private session | rejected by `trg_lh_bi` |
| 40 | End the session | events and private lists deleted; inserting into the ended session rejected; next play permanent; ending twice 409 |
| 41 | Second start; expiry | 409; expired session is no longer private, cleanup procedure purges its events |
| 42 | First world visit in a private session | 409, no world created; created after the session ends |

### 06 — Administration (`tests/06-admin.test.js`)

| # | Case | Expected |
|---|---|---|
| 43 | Role matrix | listener 403 on admin; curator 200 on catalogue/reviews/health, 403 on users/audit/pipeline run; admin 200 everywhere |
| 44 | Curator adds a song with features | ACTIVE, mood-tagged, MANUAL_ENTRY provenance, audit row with the curator as actor; duplicate 409; bad ISRC and out-of-range feature 400 |
| 45 | Edit popularity and explicit flag | content rating raised from ALL; trigger audit row with old and new values |
| 46 | Curator ADD Calm and REMOVE the top mood, then re-run the mood model | both decisions survive; ADD without confidence 400; clearing works once |
| 47 | Delete a song that has been played | hidden, history kept, not playable, not in search |
| 48 | Model weight | curator 403; out of range 400; admin change audited with the admin as actor |
| 49 | Users | promotion takes effect immediately and is audited; deactivation logs the user out; admin self-demotion 409 `SELF_LOCKOUT` |
| 50 | Audit log via the app account | UPDATE, DELETE and DROP fail with error 1142 |
| 51 | Ingest twice, then forced | second run reused; forced run creates no duplicate songs; review decisions: disallowed action 400, decision 200, second decision 409, audited; listener 403 |
| 52 | Health and performance lab | ≥ 8 integrity checks with no violations; ≥ 50 tables; every lab query has a with/without plan |

### 07 — Database guarantees (`tests/07-database.test.js`)

| # | Case | Expected |
|---|---|---|
| 53 | energy 1.5, tempo 400, explicit + ALL, bad email | CHECK violation 3819 each |
| 54 | Delete an artist with songs; genre id that does not exist | 1451; 1452 |
| 55 | Mark a second analysis current; switch with the procedure | 1062; switch works, old versions kept |
| 56 | Overlapping segment; segment past the end | rejected by trigger |
| 57 | 30-day-old play vs a fresh play | short-term < 20 % of the fresh play; long-term > 60 % |
| 58 | Merge a duplicate that has a play, rating and playlist entry | all moved to the canonical song; duplicate MERGED; audited; self-merge and second merge 400 |
| 59 | World regenerate, rollback, second rollback; force two ACTIVE via SQL | v2 then v1 active, v2 ROLLED_BACK; 400; 1062 |
| 60 | Duplicate job key; trend job | 1062; snapshot has 24H, 7D, 30D |
| 61 | Functions | completion 50 % and capped at 100; decay(7, 7) = 0.5; Monday week start; text normalisation |

### 08 — Sessions, CSRF and accounts (`tests/08-sessions.test.js`, 17 tests)

| # | Case | Expected |
|---|---|---|
| 1 | Browser registration | httpOnly + SameSite=Strict `muse_session` cookie, readable `muse_csrf`, no token in the body, only the SHA-256 of the token stored |
| 2 | Cookie write without / with a wrong / with the right `X-CSRF-Token`; cookie read | 403 `CSRF_FAILED`, 403, 200; GET needs no token |
| 3 | CSRF token of another session | 403 |
| 4 | `Origin: https://evil.example` on a write and on sign-in; an allowed dev origin | 403 `ORIGIN_REJECTED` twice; 200 with `Access-Control-Allow-Credentials: true` |
| 5–6 | Logout with a cookie, with a bearer token | the old token gets 401; row revoked with reason `LOGOUT` |
| 7 | Expired session | 401 with "expired" |
| 8 | Garbage, oversized, SQL-looking and malformed tokens | 401, never 500 |
| 9 | Sessions list, revoke one, someone else's session id, sign out everywhere | 3 sessions with one `current` and no token fields; 404 for foreign ids both ways; all tokens 401 |
| 10 | Change password: wrong current, weak, same as before, valid | 400 `WRONG_PASSWORD`, 400, 400; then this session works, the other gets 401, old password refused, audited |
| 11 | Delete account without confirmation, wrong password, valid | 400, 400; user, history and sessions gone; token 401; audited |
| 12 | Last admin deletes themself | 409 `LAST_ADMIN` |
| 13 | Admin deactivates a user, then re-activates | all sessions revoked; re-activation does not revive them |
| 14 | `/health`, `/ready` | liveness without DB; readiness with schema version = latest migration, provider states, no secrets |
| 15 | Security headers | `no-store`, `nosniff`, `frame-ancestors 'none'`, no `X-Powered-By` |
| 16 | Housekeeping | sessions ended > 30 days ago are purged |
| 17 | `/auth/session` | GET returns 200 `{authenticated:false}` for anonymous/stale cookies without creating a user; POST creates a guest session (201); signed-in callers receive their profile |

### 09 — Providers against a local mock server (`tests/09-providers.test.js`, 15 tests)

| # | Case | Expected |
|---|---|---|
| 1 | Defaults | every external provider `disabled`, local media `ready`; calls throw `DISABLED`; admin test → 409 `PROVIDER_NOT_CONFIGURED` |
| 2 | Enabled without / with invalid settings | `missing_credentials` with variable names; `invalid_config` (MusicBrainz UA without contact, unknown AI provider, non-http preview URL) |
| 3 | No answer | `TIMEOUT` after exactly 1 + 2 attempts |
| 4 | 503, 503, 200 | the 200 body is returned after retries |
| 5 | 429 with `Retry-After: 0`, then persistent 429 | success; then `RATE_LIMITED` after 2 attempts |
| 6 | 401 with `?key=SECRET123` | not retried; message does not contain the key |
| 7 | HTML body; refused port | `BAD_RESPONSE`; `NETWORK`/`TIMEOUT` |
| 8 | Two calls with a 300 ms minimum interval | ≥ 290 ms apart |
| 9 | MusicBrainz | identifying User-Agent sent; mapping to metadata-only records; missing `recordings` → `BAD_RESPONSE` |
| 10 | TMDB enrichment twice; ambiguous results | stored once with Bearer token, second run `created:false, changed:false`, film page shows overview + attribution; ambiguous → candidates, nothing stored |
| 11 | TMDB 401; TMDB timeout | 502 `PROVIDER_CREDENTIALS_REJECTED` without echoing the token; 504 `PROVIDER_TIMEOUT` |
| 12 | YouTube search twice; an invalid video id | one link stored, second run `created:false`, invalid id dropped; song page shows the link |
| 13 | Preview provider: https URL; timeout; http URL; 404 | plays the preview with attribution; falls back to the sketch without marking; refuses http; marks `UNAVAILABLE` and falls back |
| 14 | AI fallback | not called when the local parser understands; used for unknown text with only known moods kept and only the sentence sent; 500 → same 422 as without AI; never called in a private session |
| 15 | AI reply parsing | non-JSON and unknown moods ignored; at most 3 moods |

### 10 — Product behaviour (`tests/10-product.test.js`, 11 tests)

| # | Case | Expected |
|---|---|---|
| 1 | Metadata-only song | `playback.playable=false`; start → 409 `NO_PLAYBACK_SOURCE` without a history row; never in daily/discovery/regional lists; demo songs report the "Demo fixture" label and no invented URL |
| 2 | Local media | registration needs `catalog.write`, rejects traversal/odd names, 404 for missing files, idempotent; song plays `/api/media/:id`; anonymous 401; 200 with `audio/wav`; Range → 206; file removed → 404 `MEDIA_UNAVAILABLE`, marked unavailable, song metadata-only again; hourly check restores it |
| 3 | "Not for me" | gone from three later lists; listed in dismissals; foreign batch id not linked; refused in a private session; undo works; unknown song 404 |
| 4 | World feedback | stored, visible, owner-only (404), invalid value 400; `NOT_FOR_ME` recorded in the evidence and the regenerated world uses another archetype; removable; refused in a private session |
| 5 | World refresh fails (generator replaced by one that throws) | 503 `WORLD_REFRESH_FAILED`, no internal text leaked, same world id and version, still exactly one active |
| 6–7 | Film and language pages | albums, songs, composers; language songs, regions; 404 / 400 for unknown or invalid ids |
| 8 | Search edge cases | empty and 1-character 400; nonsense 0 results; 81 characters 400; misspelling "venela" finds "Vennela"; an alias finds its artist |
| 9 | Database outage (pool replaced by one that fails with `ECONNREFUSED`) | 503 `DATABASE_UNAVAILABLE` without connection details; `/ready` 503 `down`; `/health` 200; recovers afterwards |
| 10 | Schema | latest migration applied; one collation across all views, routines and triggers |
| 11 | Onboarding composers | composers with film credits offered, saved at weight 0.9, answers pre-filled on redo, more than 4 refused |

### Empty catalogue (`tests/empty/empty-catalogue.test.js`, run by `npm run db:verify`)

Readiness reports 0 songs and stays ready; the first account registers and onboards;
browse, search, every recommendation strategy, trending, insights, playlists, likes,
history, dismissals and the MUSE World all answer without errors (empty lists).

### Frontend (`npm run test:web`, 25 tests)

| File | Checks |
|---|---|
| `services/api.test.js` | cookie parsing; CSRF header only on unsafe methods; old localStorage token removed; same-origin credentials; error mapping; 401 handler skipped for the quiet sign-in checks; network failure → `NETWORK` and offline signal; endpoint shapes |
| `lib/format.test.js` | durations, calendar dates vs instants, scores, hours, plurals, stable hash |
| `components/Intro.test.jsx` | labelled dialog, Skip focused, Skip/Escape finish and remember, plays through to the brand, reduced motion waits for Continue |
| `components/Songs.test.jsx` | metadata-only label and disabled play; "Not for me" calls the API with the batch and removes the row; hidden in private sessions; empty list renders nothing; demo badge only in verbose mode |
| `components/ui.test.jsx` | outage message + retry; modal labelled, focuses the first field, closes on Escape; field label/hint/error wiring |

## Defects found by testing and fixed

| Defect | Found by | Fix |
|---|---|---|
| Concurrent recommendation requests deadlocked (shared next-key locks of `INSERT … SELECT` under REPEATABLE READ) | case 20 / load on the home page | READ COMMITTED for list generation + retry ([CONCURRENCY.md](CONCURRENCY.md)) |
| Visiting MUSE World during a private session created a permanent world | case 38 (snapshot differed) | worlds are read-only in private sessions; case 42 added |
| Timestamps shown off by the viewer's UTC offset ("started 6 hr ago" for a new session) | browser walk-through | explicit `DB_TIMEZONE`; DATETIMEs sent as ISO instants; DATE values parsed as local days; case 30 added |
| Private-session memory showed negative "taste" scores after a skip | browser walk-through | shown as "leaning towards" and "skipping" |
| Job claim with `SKIP LOCKED` blocked the second worker | concurrency experiment 3 | index `(status, job_id)` + READ COMMITTED |
| Nested analysis fields lost when canonicalising feed JSON (`energy` NULL) | ingestion run | recursive key sort; analysis validated before storage |
| `ONLY_FULL_GROUP_BY` error in the Most Replayed smart playlist | API smoke test | aggregate in a subquery, then join the view |
| MUSE World generation failed after migrations ("Illegal mix of collations") — routines re-created by a migration inherited a different session collation | first fresh setup with migrations (worlds job DISCOVERED with the error) | migrations pin `utf8mb4_general_ci`; 10-product case 10 asserts one collation everywhere |
| `db:verify` dropped the main database's grants (06_security recreates the app account) | first verification run | verification uses its own app account and drops it afterwards; documented "one app account per database" |
| A nonsense search word matched 28 songs (ngram FULLTEXT matches any shared letter pair) | empty-search edge case | letter-pair coverage filter; misspellings and aliases still match (case 8) |
| Logins in the browser checks hit the IP rate limit (successful logins were counted) | browser checks | only failed attempts count; limits configurable |
| Modal focused its Close button instead of the first field; form hints were part of the field's accessible name | component tests | focus the first form field; hints/errors linked with `aria-describedby` |
| Song page overflowed horizontally on a phone (grid item with a wide table) | browser checks | `min-width: 0` on grid children |
| Mood chip confidence text failed WCAG contrast | axe-core scan | lighter text colour |
| Registration briefly redirected to Home before onboarding | browser checks | redirect straight to onboarding when not onboarded |

## Browser walk-throughs

| Journey | Steps | Result |
|---|---|---|
| Listener tour (`aarav`) | home, mood picker, mood result, "Why this song?" with player, world, daily mix, search, song, profile, library, recovery, artist, settings, smart playlists | no console errors or failed API calls |
| Finalisation checks (`e2e/finalisation.py`, 43 checks) | intro (focus, Escape, not repeated, reduced-motion still frame); cookie flags and no readable token; skip link; metadata-only and demo labels; "Not for me"; player label, queue (Escape closes), volume; world feedback; film and language pages; empty search; offline banner on/off; sessions and hidden songs in Settings; new account with two devices → password change signs the other out → delete account → cannot sign in; admin providers (6 rows, untestable when unconfigured, no secrets); phone player and no overflow; axe-core on 10 screens | 43 / 43; no console or server errors |
| New listener | register → onboarding (Telugu, Hindi, genres, artists, composers, moods) → home → "I want something energetic" → play the first song to the end (demo speed) → rate 5★ → add to a new playlist → profile → ask again | recommendations changed after the play and rating; no errors |
| Curator/admin, private session, devices | admin overview, catalogue, review queue, ingest run, pipeline, moods, models, users, health, performance, audit; a listener's private session with plays; phone (390 × 844) and tablet (820 × 1180) | no errors; no horizontal overflow on the phone |

Screenshots from these runs are in [`screenshots/`](screenshots/).
