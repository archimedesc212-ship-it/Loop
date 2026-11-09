# Viva preparation — 30 questions with answers

Answers point to where the evidence is, so you can open the file or run the command during the viva.

## Design and normalisation

**1. Why MySQL and a relational model for a recommendation system?**
The data is highly relational (users–plays–songs–artists–moods), integrity matters (a play must belong to a real session of the same user; one rating per user-song), and the project's point is to push logic into the DBMS: constraints, triggers, procedures, window functions. MySQL 8 has everything needed — CTEs, window functions, CHECK constraints, generated columns, JSON, FULLTEXT ngram — and InnoDB gives row-level locking and ACID transactions.

**2. Walk me through normalising the data.**
Start from a flat listening sheet. 1NF splits repeating groups (genres, moods, languages) into `song_genres`, `song_moods`, `user_languages`. 2NF removes partial dependencies on the composite key `(user, song, played_at)`: song facts go to `songs`, user facts to `users`/`user_profiles`, `rating` to `ratings(user_id, song_id)`. 3NF removes transitive dependencies: artist country → `artists`, region name → `regions`, album details → `albums`, audio analysis → `audio_features`. Every determinant left is a candidate key, so the tables are in BCNF. *(docs/DATABASE_DESIGN.md §3)*

**3. Where did you denormalise, and how do you keep it correct?**
Generated columns for normalised titles (cannot drift); trigger-derived play flags (completion %, completed, skipped, replay); trigger-maintained playlist count/length; atomic session counters; materialised preference tables rebuilt by a procedure. The health panel has checks that compare stored counters with recomputed values. *(§3 "Controlled redundancy")*

**4. Surrogate or natural keys?**
Surrogate for entities whose identity changes (songs get retitled, artists merged); natural where identity is stable and meaningful (`region_code`, `permission_code`, `reason_code`, `archetype_code`). Composite PKs for relationship tables, which also enforce "one rating per user per song" by construction.

**5. How do you guarantee "exactly one current audio analysis per song"? A CHECK can't see other rows.**
A VIRTUAL generated column `current_song_key = IF(is_current = 1, song_id, NULL)` with a UNIQUE index. UNIQUE ignores NULLs, so any number of old versions can exist, but two current rows collide. The same pattern enforces one active private session per user, one active world per week, one active model per kind, one primary genre per song and one pending review per record. Test: `audio analysis is versioned…`.

**6. Why is `listening_history`'s foreign key to sessions composite?**
`(session_id, user_id) → listening_sessions(session_id, user_id)`. A single-column FK would allow a play by user A inside user B's session. The composite FK makes that impossible.

**7. What ON DELETE rules did you choose?**
CASCADE for owned data (a user's sessions, a playlist's entries), RESTRICT where deletion would destroy history (an artist with songs, a model with outputs), SET NULL for optional links (album of a song, source list of a play). Deleting a song with plays or provenance is turned into hiding it (`status = 'HIDDEN'`) by the API.

## SQL and programmability

**8. Show a query that uses window functions meaningfully.**
Q16 listening streaks (gaps-and-islands: `day − ROW_NUMBER()` is constant within a run of consecutive days), Q18/Q19 Mood Journey (`LAG`/`LEAD` over plays in a session), Q17 7-day moving average (`AVG() OVER (ROWS 6 PRECEDING)`), and inside the engine `ROW_NUMBER() OVER (PARTITION BY artist_id …)` for diversity caps.

**9. When would you use a correlated subquery instead of a join?**
When the comparison is per row against an aggregate of its own group: Q12 "songs more energetic than their own genre's average". A join to a pre-aggregated derived table is often faster; both are shown.

**10. Why is the recommendation engine a stored procedure?**
It reads ~15 tables and writes three; doing it in SQL avoids shipping thousands of rows to Node, keeps the scoring next to the indexes, makes it callable from SQL for testing, and lets the weights be data (`model_parameters`) read inside the same statement.

**11. Which triggers did you write and why so few?**
14 triggers for three jobs: integrity that needs other rows (private-session isolation, immutable history, non-overlapping segments), derived columns that must never drift, and audit logging. Preference learning is deliberately a procedure: it needs time decay over all a user's rows, must be re-runnable and versioned, and would make every insert slow as a trigger.

**12. How does the audit log know who did something if triggers can't see the HTTP user?**
The API sets the session variable `@muse_actor_id` at the start of an admin transaction on that connection and clears it afterwards; audit triggers read it. The app account has only SELECT and INSERT on `audit_logs`, so it is append-only.

**13. Explain one view and why it exists.**
`v_current_song_moods` joins `song_moods` to the active MOOD model only and ranks moods per song. Every consumer gets "the moods of this song" without knowing about versions, while older model outputs stay in the table for comparison (Q27).

## Transactions and concurrency

**14. Give an example of a transaction and what goes wrong without it.**
Finishing a play: store listened time, add the final event, increment session counters, rebuild preferences. Without a transaction, a crash after the play but before the refresh would leave a play that never influenced taste. T3 in `08_queries.sql` shows ROLLBACK undoing both a rating and the preference refresh.

**15. Demonstrate a lost update and how you prevent it.**
`npm run demo:concurrency`, Experiment 1: two naive read-modify-writes under REPEATABLE READ both read 0 and both write 1. Fixes: `SELECT … FOR UPDATE` (the second waits and reads 1) or an atomic `UPDATE … SET plays = plays + 1`, which MUSE uses.

**16. You use READ COMMITTED somewhere. Why is that safe?**
For recommendation generation. Under REPEATABLE READ, `INSERT … SELECT` takes shared next-key locks on all rows it reads; concurrent requests for one user deadlocked (reproduced by a test: 3/3 failures). With READ COMMITTED and row-based binlog, the read is a consistent non-locking read; the statement only writes rows of its own new batch. The test now passes; a 2-retry deadlock handler stays as a safety net. *(docs/CONCURRENCY.md case 4)*

**17. How do two workers avoid running the same job?**
`SELECT … FOR UPDATE SKIP LOCKED` on queued jobs, with an index `(status, job_id)` matching the ORDER BY and READ COMMITTED. Without the index InnoDB locks every row it sorts, so the second worker gets nothing (Experiment 3). Plus a UNIQUE idempotency key: the same job for the same period can never be created twice.

**18. How do you avoid deadlocks in general?**
Consistent lock order (user row first, then the specific rows), short transactions, indexes so locking reads touch few rows, READ COMMITTED where gap locks are unnecessary, and retrying 1213/1205 where a retry is safe.

## Indexing and performance

**19. Show an index making a difference.**
`npm run demo:explain`: a user's last 7 days of plays — with `idx_lh_user_time` a range scan of ~55 rows and no filesort; with `IGNORE INDEX` a full scan of ~2 668 rows plus filesort. The gap grows linearly with total history. *(docs/PERFORMANCE.md)*

**20. Why `(user_id, started_at)` and not `(started_at, user_id)`?**
Equality column first, range/sort column second. With `user_id` first the index jumps to one user and reads their plays in time order. With `started_at` first it would scan every user's plays in the time range.

**21. Why a FULLTEXT ngram index?**
Titles include transliterated Indian-language words; ngram tokenisation matches partial words ("vennela" inside "Sirivennela") and gives relevance ranking, which `LIKE '%…%'` cannot do with an index.

## Recommendation and intelligence

**22. How is a song's mood decided?**
`fn_mood_fit` compares the song's audio features with each mood's target profile (energy and valence weighted most, plus tempo band); fit above a floor becomes confidence; keep the best mood and others ≥ 0.35, max 4. Curator ADD/REMOVE decisions are re-applied after every run so humans win. *(docs/ALGORITHMS.md §1)*

**23. How does MUSE learn a listener's taste over time?**
Each event becomes a signal (complete +1, skip −0.6, like +2, rating ±0.8/star…), decayed with half-lives of 7 days (short-term) and 90 days (long-term), normalised and blended 40/60, then mixed with onboarding answers until 25 completed plays. Test: a 30-day-old play is < 20 % of a fresh one short-term but > 60 % long-term.

**24. What is the scoring formula?**
Weighted mean over the signals that apply (mood 0.30, audio 0.18, preference 0.18, context 0.10, recency 0.07, regional 0.07, trend 0.05, exploration 0.05) minus 0.15 × a repetition penalty; then diversity caps of 2 songs per artist and 40 % per genre. Weights are rows in `model_parameters`, and a test proves changing one changes the ranking.

**25. How are explanations generated, and how do you know they are true?**
They are inserted in the same procedure from the same stored signal scores, each with a threshold (e.g. MOOD_MATCH only if mood score ≥ 0.45, FAVORITE_GENRE only if the genre is in the top 3 with ≥ 3 plays) and rendered from templates. No reason exists without the signal behind it.

**26. How do you handle a brand-new user (cold start)?**
Onboarding stores rank-weighted genre/artist/mood choices; the blended preference is 100 % onboarding at zero plays and moves linearly to 100 % behaviour at 25 completed plays; ONBOARDING_PICK reasons say so.

## Privacy, security, ethics

**27. Prove that private mode doesn't write to the permanent profile.**
Two layers: the API routes private plays to `incognito_events` and refuses ratings/likes/playlists; the trigger `trg_lh_bi` rejects permanent history while a private session is active, even from raw SQL. Test `a busy private session…` snapshots 14 permanent tables, does plays, skips, searches, recommendations and insights in private mode, and asserts the snapshot is byte-for-byte identical. The test also found a real bug — the weekly world was being created during a private session — which was fixed.

**28. How is SQL injection prevented?**
All values go through `?` placeholders; identifiers are never taken from input except via fixed allow-lists; validation rejects wrong types first; the app's DB account cannot run DDL. Test: `' OR 1=1 --` as a login and `'; DROP TABLE songs; --` as a search are treated as text.

**29. Why a separate least-privilege database user?**
If the API were compromised, the attacker could not drop tables, alter the schema, grant privileges, rewrite reference data or erase the audit log. The owner account is only used by the setup script.

**30. Mood and region are sensitive. How do you avoid harm?**
Moods describe music, never a diagnosis — the UI and docs say so, and Recovery is a musical arc. Region is a small weighted signal (0.07, with a 0.25 bonus inside it for same-region artists), never a filter; languages come from the user's own choice. There is no copyrighted audio, lyrics or artwork: the catalogue is fictional and demo playback is a synthesised sketch labelled as such; songs without a permitted source are shown as metadata only.

**31. How are users' mood ratings different from the AI's mood tags?**
They answer different questions and have different keys. `song_moods (song, mood, model) → confidence` is the model's prediction; `song_mood_ratings (user, song, mood) → match_percentage` is one listener's opinion, 0–100 %. Keeping them in separate tables keeps both in BCNF and guarantees user feedback can never overwrite the AI output. The listeners' average is a view (`v_song_mood_rating_stats`), so it is never stored and cannot drift; a song with no ratings has no average rather than 0 %.

**32. Why rank by a Bayesian average?**
A song with one 100 % rating would otherwise beat a song with many 96 % ratings. `(C·M + n·avg)/(C + n)` pulls small samples towards the mood's overall mean M; with more ratings the song's own average dominates. It is a ranking heuristic, shown as a "score", not as a rating, and it does not make a small sample statistically reliable.

