# Transactions and concurrency

## Where MUSE uses transactions

| Unit of work | Why it must be atomic | Isolation / locks |
|---|---|---|
| Finish a play: store listened time → final event → session counters → rebuild preferences | a play must never count without updating taste, or vice versa | RR; `SELECT … FROM users … FOR UPDATE` first, then the play row `FOR UPDATE`; counters with `plays = plays + 1` |
| Rate / like / unrate + preference refresh | same as above | RR; user row lock |
| Register: `users` + `user_profiles` | no account without a profile | RR |
| Onboarding answers (languages, genre/artist/mood weights) | partial onboarding would skew cold start | RR |
| Create a playlist with songs | all songs or no playlist (a bad id rolls the playlist back) | RR |
| Add a song to a playlist | positions stay unique, count exact | RR; playlist row `FOR UPDATE` |
| Generate a recommendation list: batch → `sp_generate_recommendations` (items + reasons) | a list is never half-written | **READ COMMITTED** + deadlock retry (see case 4) |
| Generate a MUSE World version | batch + world row + supersede old version together | READ COMMITTED; user row `FOR UPDATE` serialises generators for one user |
| End a private session: mark ENDED + delete events + delete private lists | temporary data must not outlive the session | RR |
| Admin: update user role / active flag | never zero active admins | RR; `FOR UPDATE OF u` on all active admins |
| Review decision | an item is decided once | RR; review row and its source record `FOR UPDATE` |
| Procedures `sp_merge_songs`, `sp_rollback_world`, `sp_close_listening_session`, `sp_generate_trend_snapshot`, `sp_cleanup_expired_incognito` | multi-table changes | own `START TRANSACTION … COMMIT`, `EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END` |
| Claim a pipeline job | two workers must never run the same job | READ COMMITTED; `FOR UPDATE SKIP LOCKED` on `idx_jobs_queue` (case 3) |

In code, `withTransaction(fn, { isolation, retries, actorId })` in
`backend/src/config/db.js` opens a dedicated connection, optionally sets the
isolation level for the next transaction, sets `@muse_actor_id` for audit
triggers, commits or rolls back, and retries on deadlock (1213) or lock wait
timeout (1205) with jittered back-off when asked.

**Lock ordering.** Every write path that touches a user's data locks the `users` row
first, then specific rows. Procedures follow the same order. A consistent order is
what prevents deadlocks between, say, a rating and a play finishing at the same time.

**Database-level guarantees** that hold even under concurrency, because they are
unique indexes rather than application checks: one current audio analysis per song,
one active private session per user, one active world per user-week, one pending
review per record, one rating per user-song, one job per idempotency key, one entry per
song per playlist.

## Experiments (`npm run demo:concurrency`)

The script opens two real connections (A and B) and interleaves their statements
step by step. Output from the latest run:

### 1. Lost update on `listening_sessions.plays`

Two "finish play" requests for the same session arrive together.

```
1a. Naive read-modify-write (REPEATABLE READ, no lock)
   A reads plays = 0
   B reads plays = 0
   A writes plays = 1, COMMIT
   B writes plays = 1, COMMIT
   → final plays = 1  (expected 2: ONE PLAY WAS LOST)

1b. Pessimistic locking: SELECT … FOR UPDATE
   A SELECT … FOR UPDATE → plays = 0 (row now locked)
   B SELECT … FOR UPDATE → waits for A's lock …
   A writes plays = 1, COMMIT (lock released)
   B lock granted, reads plays = 1, writes plays = 2, COMMIT
   → final plays = 2  (correct)

1c. Atomic update: UPDATE … SET plays = plays + 1   (what playbackService.finish uses)
   → final plays = 2  (correct, no explicit SELECT needed)
```

REPEATABLE READ does **not** prevent lost updates in a read-modify-write: each
transaction reads its own snapshot. Either lock the row for the read, or let the
`UPDATE` read the current value itself.

### 2. Isolation levels

```
READ COMMITTED   A reads 0, B commits +5, A reads again → 5  (non-repeatable read)
REPEATABLE READ  A reads 5, B commits +5, A reads again → 5  (same snapshot)
```

### 3. Two workers claiming jobs

```
3a. Naive claim: ORDER BY created_at (no index matches the sort), REPEATABLE READ
   A claims job 12
   B claims NOTHING: A read and locked every queued row to sort them
   → workers serialise; the queue drains one job at a time

3b. MUSE claim: idx_jobs_queue (status, job_id) matches ORDER BY job_id, READ COMMITTED
   A claims job 12 (only that row is locked)
   B claims job 13 (A's row skipped, no waiting)
```

`SKIP LOCKED` only helps if the claiming statement locks just the row it returns.
Without an index matching `WHERE status = 'DISCOVERED' ORDER BY …`, InnoDB scans and
locks every candidate before sorting; under REPEATABLE READ it also keeps gap locks.
The fix is an index on `(status, job_id)` plus READ COMMITTED for the claim.

### 4. The deadlock found in testing (and its regression test)

**Symptom.** The home page fires several list-generating requests at once (daily
mix, "because you liked", and the weekly world on a first visit). When requests for
the same user overlapped, some returned `503 DEADLOCK`.

**Cause.** `sp_generate_recommendations` writes with `INSERT INTO recommendation_items … SELECT …`
over many tables (listening history, preferences, trends, ratings). Under
REPEATABLE READ, InnoDB takes **shared next-key locks on every row the `SELECT` part
reads** (so that statement-based replication would replay identically). Two such
statements for the same user lock overlapping ranges of `listening_history` and
the preference tables in different orders, while each also holds locks on its own new
rows — a classic lock-order cycle.

**Fix.** Run that transaction at READ COMMITTED (the binary log is in ROW format, so
consistent reads without shared locks are safe for replication), and retry up to two
times on 1213/1205 as a safety net. READ COMMITTED is correct here because the
scoring statement only needs a consistent snapshot *for the duration of that one
statement*, and the only rows it writes belong to the new, private batch.

**Proof.** Test `concurrent recommendation requests do not deadlock` fires 12
simultaneous recommendation requests for one user:

| Configuration | Result |
|---|---|
| REPEATABLE READ, no retry (before) | failed 3 of 3 runs (`503`) |
| READ COMMITTED, no retry | passed 5 of 5 runs |
| READ COMMITTED + 2 retries (shipped) | passes in every `npm test` run |

## Isolation levels used, and why

| Level | Where | Reason |
|---|---|---|
| REPEATABLE READ (default) | everything else | stable snapshot inside multi-statement units; explicit row locks where a decision depends on a value that is then written |
| READ COMMITTED | recommendation and world generation, job claim | avoid shared next-key locks of `INSERT … SELECT` and gap locks during `SKIP LOCKED` claims |
| SERIALIZABLE | not used | would turn every read into a shared lock; the same guarantees are reached more cheaply with targeted `FOR UPDATE` and unique keys |
