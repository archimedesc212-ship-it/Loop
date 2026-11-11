# Assumptions, decisions and known limitations

## The brief

The MUSE brief asked to audit and complete the existing project rather than start
again, and its text ends mid-sentence in section 37 ("Do not make…"). Where it stopped,
the earlier SONORA brief (same domain, overlapping requirements) and the brief's own
recurring principles were used as the guide: no fake features, no copyrighted media,
mood describes music not people, region is a signal not a stereotype, private sessions
never write to the permanent profile, and every claim in the UI must be backed by data.

Everything below is a decision that the brief left open. Each one is a parameter or a
documented rule, so it can be changed without redesign.

## Domain rules

| Topic | Decision | Where |
|---|---|---|
| Completed play | ≥ 90 % of the song's duration | `trg_lh_bi`, `trg_lh_bu` |
| Skip | not completed, < 30 s and < 50 % | same |
| Replay | the same song finished by the same user in the previous 24 h | `trg_lh_bi` |
| Listening session | closes after 30 idle minutes (`SESSION_IDLE_MINUTES`) | scheduler, `sp_close_listening_session` |
| Private session lifetime | 120 minutes unless ended (`INCOGNITO_TTL_MINUTES`); one active per user | `.env`, unique generated key |
| Private session start | the open permanent session is closed first, so it counts towards the profile | `incognitoService.start` |
| World during a private session | an existing world is shown read-only; none is created, regenerated or rolled back | `worldService` |
| Week | starts on Monday (`fn_week_start`) | functions |
| Time zone | the API's database sessions run in `DB_TIMEZONE` (default `+00:00`); set `+05:30` so "today" and "this week" follow Indian days. Timestamps leave the API as ISO-8601 instants, so every browser shows correct local times | `.env`, `config/db.js` |
| Cold start | onboarding fades out linearly over the first 25 completed plays | `cold_start_plays` |
| Preference half-lives | 7 days short-term, 90 days long-term, blended 40/60 | PREFERENCE model parameters |
| 1★ rating | the song is never recommended to that listener again | engine filter |
| Recently played | songs played in the last 2 hours are left out of new lists | `recent_exclusion_hours` |
| Diversity | ≤ 2 songs per artist, ≤ 40 % of a list from one genre | `artist_cap`, `genre_max_share` |
| Region | a 0.07-weight signal (with a 0.25 bonus inside it for same-region artists); never a filter | RECOMMENDER parameters |
| Content filter | `OFF`, `NO_EXPLICIT` (no explicit), `FAMILY` (no explicit and rating ALL only); explicit songs can never be rated ALL (CHECK) | `user_profiles`, engine filter |
| Deleting a song | hidden instead when it has plays or provenance, so history and audit stay intact | `adminService.deleteSong` |
| Duplicate detection | ISRC → same song; same artist + normalised title + duration within 3 s → same song; similar title (Dice ≥ 0.8) and duration within 10 s → human review, never auto-merged | `ingestService` |
| Mood count | 17 moods in 4 categories; up to 4 moods per song | seed, MOOD model |

## Data and media

- **MySQL development seed**: fictional and project-authored (CC0) — titles, artists, albums, films, aliases and audio-feature values. Names were generated to sound plausible in each language; any resemblance to real works is unintended. This seed remains for the database-backed development and integration-test profile.
- **Public static archive**: uses the actual 28,372-record CC BY 4.0 music-feature dataset supplied with the project. The build is checksum-pinned, omits lyrics, and publishes only metadata/features. It does not contain recordings, stream URLs, duration, language, album or film metadata.
- **Audio features** are supplied values (in the seed and the partner feed), not computed from audio. The schema keeps analyses per model version, so a real analyser would be added as a new `AUDIO_FEATURES` model.
- **Database-backed development profile playback**: demo seed songs can play a synthesised "demo sketch" generated in the browser from seed tempo/key/mode/energy/valence and labelled as not the recording. Licensed local files and a licensed preview provider are supported by that separate backend profile. The public static archive sets every supplied dataset record to metadata-only and disables playback because the upload has no audio files or stream URLs.
- **Demo speed**: the player can run sketches at 10× so a full play can be demonstrated quickly; listened seconds are still counted in song time, never wall-clock time.
- **External sources**: MusicBrainz, TMDB, YouTube Data API, a vendor-neutral licensed preview contract and an optional AI helper are implemented as separate adapters, all disabled by default; they are tested against a local mock server only (see [PROVIDERS.md](PROVIDERS.md)). If no source is reachable the ingest job is `SKIPPED` and the existing catalogue keeps serving — nothing is marked as live.

## Interpretation of "intelligence"

- Mood tagging, text understanding and recommendation are **deterministic, rule-based and explainable**, not trained ML models. This is a deliberate choice for a DBMS project: every output can be traced to stored numbers. The model registry (`intelligence_models`, versioned parameters) is where learned models would plug in.
- The free-text parser understands phrases in its keyword table (English plus common Hinglish words such as *dil*, *josh*, *masti* and the intensifier *bahut*); curators can add phrases in Admin without code changes. Unknown sentences are refused with suggestions rather than guessed.
- Search tolerance comes from ngram FULLTEXT (partial words, transliteration variants) and SOUNDEX on artist names ("sounds like"); there is no general spelling corrector for song titles.

## Operations

- The scheduler runs inside the API process (minutely and hourly ticks). All jobs are idempotent and claimed safely, so running several API instances is correct, but a dedicated worker is the better production layout.
- One MySQL instance; no replication or partitioning (see [PERFORMANCE.md](PERFORMANCE.md) for the scaling path).
- `npm run db:setup` drops and recreates the database (the reset button for demos); `npm run db:migrate` upgrades an existing database through versioned migrations.

## Known limitations

| Limitation | Impact | Next step |
|---|---|---|
| No collaborative filtering | recommendations use the listener's own behaviour, catalogue features and global trends only | weekly user–user similarity table from preference vectors |
| No email verification or password reset | demo scope | token table + mail provider |
| Generative world art and covers are abstract | no real artwork by design | — |
| Trend snapshots are hourly | "24H" trends can lag by up to an hour | more frequent snapshots if needed |
| Recommendation scoring is O(catalogue) per request | fine at thousands of songs (≈ 120 ms at 104) | pre-filter candidates by mood index at large scale |

## Not implemented from the brief

Nothing in the visible sections of the brief was left as a placeholder. Items that are
present but deliberately limited are listed above (external sources disabled by default,
rule-based models, demo-sketch playback). The current implemented / tested / partial /
blocked status of every feature is in [STATUS.md](STATUS.md). Section 37 onwards of the brief was not available.
