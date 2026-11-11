# Mood-wise percentage ratings

Listeners rate **how well a song fits each mood**, from 0 to 100 % with up to two decimals
(e.g. Happy 92.50 %, Sad 18.00 %). These are not star ratings and not the AI's opinion.

## 1. What existed before (audit)

| Item | Found in the schema / code |
|---|---|
| Users | `users.user_id INT UNSIGNED` (session-based auth in `middleware/auth.js`; `req.user` comes from the session token) |
| Songs | `songs.song_id INT UNSIGNED`, `status` (only `ACTIVE` songs are visible to listeners) |
| Moods | `moods.mood_id SMALLINT UNSIGNED` (17 moods, grouped by `mood_categories`) |
| AI mood prediction | `song_moods (song_id, mood_id, model_id) → confidence DECIMAL(4,3)`, current model via `v_current_song_moods`, written only by `sp_analyze_song_moods` and curator overrides |
| Existing ratings | `ratings (user_id, song_id) → rating 1–5` — a whole-song star rating that feeds taste learning |
| Conventions | snake_case, `fk_*` / `uq_*` / `chk_*` / `idx_*` names, composite natural keys for associative tables, versioned migrations in `database/migrations/` (checksummed), every write through parameterised queries, MySQL errors translated in `middleware/errorHandler.js` |

Compatibility points that shaped the design: FK types must be `INT UNSIGNED` / `INT UNSIGNED` / `SMALLINT UNSIGNED`;
the error handler's duplicate-key rule `/ratings\.PRIMARY/` would also match `song_mood_ratings.PRIMARY`, so the new rule is
listed first; `sp_merge_songs` moves a duplicate song's ratings, likes and playlist entries, so it had to move mood ratings too.

## 2. Four different numbers, never mixed

| Name in API / UI | Meaning | Source |
|---|---|---|
| `aiConfidence` — "AI 72 %" | the mood model's prediction | `song_moods.confidence` (unchanged by this feature) |
| `mine` — "Your rating" | one user's judgement | `song_mood_ratings.match_percentage` |
| `community.average` + `count` — "Listeners" | plain average of all users' ratings | view `v_song_mood_rating_stats` |
| `adjustedScore` — "score" pill, only when ranking by *Adjusted* | a **ranking aid**, not a rating | computed per request (section 4) |

No code path writes user ratings into `song_moods`; a test snapshots `song_moods` before and after rating to prove it.
A song nobody has rated for a mood has **no** average (`null`, shown as "No ratings yet"), never 0 %.

## 3. Database (migration `0004_song_mood_ratings.sql`)

```sql
CREATE TABLE IF NOT EXISTS song_mood_ratings (
  user_id           INT UNSIGNED      NOT NULL,
  song_id           INT UNSIGNED      NOT NULL,
  mood_id           SMALLINT UNSIGNED NOT NULL,
  match_percentage  DECIMAL(5,2)      NOT NULL,          -- 0.00 … 100.00
  review_text       VARCHAR(280)      NULL,
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id, mood_id),               -- one rating per user, song and mood
  KEY idx_smr_song_mood (song_id, mood_id, match_percentage),
  KEY idx_smr_mood_song (mood_id, song_id, match_percentage),
  CONSTRAINT fk_smr_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_smr_song FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_smr_mood FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT chk_smr_pct CHECK (match_percentage >= 0 AND match_percentage <= 100),
  CONSTRAINT chk_smr_review CHECK (review_text IS NULL OR CHAR_LENGTH(TRIM(review_text)) > 0)
) ENGINE=InnoDB;
```

Plus `v_song_mood_rating_stats` (count, average rounded to 2 decimals, min, max, last rated per song and mood),
a re-created `sp_merge_songs` (mood ratings follow a merged song; if a user rated the same mood on both songs the more
recently updated rating wins), and grants for the application account.

**Why a new table** (and not columns on `songs` or rows in `song_moods`): per-mood columns break 1NF and need a schema
change per mood; `song_moods` is keyed by (song, mood, model) while a user rating is keyed by (user, song, mood) — mixing
them would break 2NF and let user feedback overwrite AI output. The new relation is in BCNF (its only determinant is the
key). Averages are computed in a view, never stored, so they cannot drift.

**Safety.** The migration only creates objects (`IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, a re-created procedure); it
changes no existing table or row and is safe to re-run. Verified on this project's database: row counts of all 63 existing
tables were identical before and after, a second `db:migrate` was a no-op, and `npm run db:verify` confirmed that an upgraded
database is structurally identical to a fresh install. Take a backup first anyway (`mysqldump --single-transaction muse > backup.sql`).

## 4. Calculations

- **Average:** `AVG(match_percentage)` over all ratings for (song, mood), with `COUNT(*)`, `MIN`, `MAX`.
- **Ranking for a mood** (`GET /moods/:id/top-rated`):
  - `rank=average` — by the plain average; ties broken by rating count (more first), then song id (deterministic).
  - `rank=adjusted` — Bayesian average `(C × M + n × avg) / (C + n)`, where *n* is the song's rating count, *avg* its average,
    *M* the mean of all ratings for that mood and *C* = `prior` (default 5). Few ratings are pulled towards *M*, so one
    perfect 100 % does not outrank many consistent 96 % ratings (tested). With `prior=0` it equals the average. It is a
    ranking heuristic: it does **not** make a small sample statistically reliable, and no fixed minimum count does either.
  - `minRatings` hides songs with fewer ratings (they are counted in `belowMinimumCount`).
  - Songs with no rating for the mood are excluded from the ranking and counted in `unratedCount`; with
    `includeUnrated=true` they are listed separately with `average: null`, ordered by the AI's prediction.
  - The listener's content filter (explicit / family) applies, and only `ACTIVE` songs are ranked.

## 5. API

See [API.md › Mood-wise percentage ratings](API.md#mood-wise-percentage-ratings). All routes require sign-in, validate
input (0–100, at most two decimals, review ≤ 280 characters), use parameterised SQL and return the standard
`{ error: { code, message } }` on failure. Batch saves run in one transaction and lock the user row first, like the other
feedback writes. Private sessions pause rating writes (reads still work).

## 6. Frontend

- **Song page** — card "How well does it fit each mood?" (`components/MoodRatings.jsx`): every mood from the database,
  with the listeners' average bar + count, the AI prediction (labelled "AI"), and your own slider + number box. Moods the AI
  tagged or someone rated are shown first ("Show all 17 moods" for the rest). Inline validation, one **Save** for all
  changed moods (single API call), Discard, Remove, loading skeleton, error state with retry, private-session notice,
  phone layout.
- **Mood page** — section "Rated by listeners" (`components/TopRatedByMood.jsx`): pick a mood, minimum ratings and
  *Average* / *Adjusted for few ratings*; shows rank, average, count, the adjusted score (labelled as a score) and the AI
  prediction; empty states explain why a list is empty; "Show unrated songs" lists songs without ratings.

## 7. Updating the MySQL Workbench `.mwb` model safely

The project's real schema comes from the SQL files; no `.mwb` file was provided, so it was not edited. To bring your model
up to date **without dropping data**:

1. Back up the database (`mysqldump --single-transaction muse > backup.sql`) and save a copy of the `.mwb`.
2. Apply the migration to the database first: `npm run db:migrate` (or run `database/migrations/0004_song_mood_ratings.sql`
   in Workbench, replacing `__DB__`, `__APP_USER__` and `__APP_HOST__` in the two GRANT lines).
3. Open the `.mwb`, then **Database → Synchronize with Any Source…** (or **Synchronize Model…**). Choose
   *Source: Live Database* → *Destination: Model file* (update the model **from** the database).
4. In the list of differences, apply only the new objects (`song_mood_ratings`, `v_song_mood_rating_stats`,
   `sp_merge_songs`) to the **model**. **Do not** run any generated script against the database — if a step offers to
   execute SQL on the server, review it and skip any `DROP`.
5. Place the new table on the EER diagram (it links to `users`, `songs` and `moods`) and save the `.mwb`.

Alternatively, create a fresh model with **File → Import → Reverse Engineer MySQL Create Script** from
`database/workbench/MUSE_ERD_Structure_Full.sql` (structure only, no data).

## 8. Configure, migrate, run, test

```bash
npm run db:migrate        # existing database: applies 0004 only, keeps all data
# or: npm run db:setup    # fresh database (drops and recreates the demo)
npm run build && npm start              # http://localhost:4000 → open any song
npm test                                # API + database tests (backend/tests/11-mood-ratings.test.js)
npm run test:web                        # Vitest (MoodRatings.test.jsx, moodRating.test.js)
npm run test:sql                        # SQL blocks incl. Q41–Q42
npm run db:verify                       # upgrade path = fresh install, re-run safety
python3 e2e/mood_ratings.py             # browser check against the running app
```

## 9. Limitations

- Demo data has **no** mood ratings: the feature starts empty and fills as people use it (nothing is invented).
- `review_text` is stored and returned by the API but the UI does not yet offer a text box for it.
- User mood ratings are not yet used by the main recommendation engine (`sp_generate_recommendations`); they drive the
  "Rated by listeners" ranking only. Adding them as a signal would be a model change (new weight) and was left out.
- The Bayesian prior weight is a request parameter (default 5), not yet a tunable model parameter in the admin UI.
- No moderation of review text, and no admin view of individual mood ratings.
