# Performance and indexing

All numbers on this page were measured on the demo dataset (104 active songs,
≈ 2.7 k plays, 13 listeners) with MySQL 8.0 on a 2-vCPU machine. Reproduce them with:

```bash
npm run demo:explain     # EXPLAIN + EXPLAIN ANALYZE with and without each index
npm run test:sql         # runs E1–E4 in database/08_queries.sql
```

The same comparison is live in the app under **Admin › Performance**.

## Index design principles

1. **Index the access path, not the column.** Composite indexes follow the query's `WHERE` equality columns first, then the range/sort column: `(user_id, started_at)` serves "this user's plays, newest first" as one range scan with no filesort.
2. **Reverse lookups get their own index.** Composite primary keys serve one direction only: `ratings(user_id, song_id)` answers "my rating"; "this song's average" needs `idx_ratings_song(song_id, rating)`.
3. **Covering where it is cheap.** `idx_sm_model_mood(model_id, mood_id, confidence)` answers "songs with this mood, strongest first" from the index alone (`Using index`).
4. **Uniqueness doubles as an index.** `uq_songs_identity`, `uq_af_one_current` and the other generated-column keys enforce rules *and* serve lookups.
5. **Index for the lock, not only for the read.** `idx_jobs_queue(status, job_id)` exists so that `SELECT … FOR UPDATE SKIP LOCKED` locks one row instead of every row it sorts (see [CONCURRENCY.md](CONCURRENCY.md)).
6. **Nothing speculative.** Every secondary index is used by a named query; `docs/DATA_DICTIONARY.md` lists them per table.

## Measured: with vs without the index

| Query | With index | Without index |
|---|---|---|
| A listener's last 7 days of plays | `range` on `idx_lh_user_time`, ≈ 55 rows, backward index scan, **0.078 ms** | `ALL`, ≈ 2 668 rows, `Using filesort`, **0.731 ms** |
| Songs carrying one mood, strongest first | `ref` on `idx_sm_model_mood`, ≈ 31 rows, `Using index`, **0.028 ms** | `ref` on `fk_sm_mood`, ≈ 46 rows, `Using filesort`, **0.066 ms** |
| Plays of one song in the last 30 days | `range` on `idx_lh_song_time`, ≈ 18 rows, **0.019 ms** | `index` scan of `idx_lh_user_song`, ≈ 2 668 rows, **0.525 ms** |
| Full-text title search "vennela" | `fulltext` on `ft_songs_title` (ngram), ≈ 1 row, **0.071 ms** | `LIKE '%vennela%'`: `ALL`, ≈ 126 rows, **0.084 ms** |
| Average rating of one song | `ref` on `idx_ratings_song`, ≈ 1 row, `Using index`, **0.013 ms** | `ALL`, ≈ 153 rows, **0.057 ms** |

"Without" is the same statement with `IGNORE INDEX (…)`, or for search the
equivalent `LIKE '%…%'`. Times are from `EXPLAIN ANALYZE`. Row estimates and
times shift a little between runs as the demo data grows (every test run adds plays);
the plan shapes do not.

**Reading the numbers.** At demo scale every query is sub-millisecond either way;
what matters is the *shape*: the rows examined grow with the table without the index
(2 668 → every future play), but stay proportional to one user's or one song's data
with it. At 10 million plays the first query would examine ~10 M rows without
`idx_lh_user_time` and still ~55 with it. The FULLTEXT row shows the opposite
lesson: on 126 titles a scan is as fast, but the ngram index also gives relevance
ranking and partial-word matching for transliterated titles, which `LIKE` cannot.

## End-to-end latency (API → MySQL → JSON)

15 sequential requests each, as `aarav` (≈ 300 plays):

| Endpoint | Median | p90 |
|---|---|---|
| `POST /recommendations/mood` (parse + score all candidates on 8 signals + store 20 items and reasons) | 120 ms | 167 ms |
| `GET /recommendations/daily` | 147 ms | 178 ms |
| `GET /search?q=vennela` | 19 ms | 27 ms |
| `GET /insights/profile` | 35 ms | 43 ms |
| `GET /insights/journey?period=weekly` | 24 ms | 33 ms |
| `POST /history` (store play + rebuild preferences in one transaction) | 37 ms | 45 ms |

The recommendation call dominates because it scores every candidate in one
`INSERT … SELECT` with several stored-function calls per row and writes the ranked
items and reasons. It is bounded by catalogue size, not history size: per-user
history enters only through pre-aggregated preference tables and two small CTEs.

## What keeps the heavy paths cheap

- **Learned preferences are materialised** (`user_*_preferences`), so recommending never aggregates a user's full history.
- **Trends are snapshots**: computed hourly into `trend_snapshots`, read with `idx_trend_lookup(window_code, entity_type, region_key, job_id, momentum_rank)`.
- **Derived play flags are stored** (completion %, completed, skipped, replay), so profile and trend queries filter on columns instead of recomputing.
- **Views hide versioning cost**: `v_current_song_moods` and `v_current_audio_features` filter by the active model / current row through indexed generated keys.
- **The mood-keyword lexicon is cached** in the API for 60 s.
- **No N+1**: list endpoints fetch flags (liked, rating) for all songs in one `IN (…)` query.

## Scaling path (not needed at project scale)

- Partition `listening_history` and `playback_events` by month (`RANGE COLUMNS(started_at)`); the primary key would have to include `started_at`.
- Pre-filter candidates by mood (`idx_sm_model_mood`) before full scoring when the catalogue reaches hundreds of thousands of songs.
- Move the scheduler to a worker process; job claiming is already safe for several workers.
- Read replica for insights and admin reporting.
