# MUSE in MySQL Workbench — step by step

These files build the complete MUSE database in MySQL Workbench without Node.js.
They are generated from the real project files (`database/01-07` and `database/migrations/`)
by `npm run db:workbench`, so they always match what the app uses.

| File | Run it? | What it does |
|------|---------|--------------|
| `MUSE_Workbench_Setup.sql` | **Yes, first** | Creates database `muse`: 64 tables, 20 views, 11 functions, 11 procedures, 14 triggers, the demo data, and records the schema version (0000–0004) |
| `MUSE_Workbench_Demo.sql` | Yes, second | Calls the stored procedures to make a trend snapshot and a "Calm" recommendation list for the demo listener, with reasons |
| `MUSE_Workbench_Queries.sql` | Yes, for the viva | 40 queries (joins, CTEs, window functions, recursive CTE, full-text…), 3 transactions, 4 EXPLAINs |
| `MUSE_ER_All_Tables.sql` | **All tables, no data** | Clean script: all 64 tables, every column, primary/unique keys and all 124 foreign keys. Creates database `muse_er_all` |
| `MUSE_Data_All_Tables.sql` | **Data for the all-tables model** | INSERTs for all 64 tables (15,712 demo rows). Run after `MUSE_ER_All_Tables(_Plain).sql`; uses database `muse_er_all` |
| `MUSE_Data_Core_Entities.sql` | **Data for the core model** | INSERTs for the 16 core tables (4,503 rows). Run after `MUSE_ER_Core_Entities(_Plain).sql`; uses database `muse_er` |
| `MUSE_ER_Core_Entities.sql` | **Simplest: entities + relationships only** | Clean script: the 16 core tables (including `song_mood_ratings`), all columns, primary/unique keys and the 24 foreign keys. No data. Creates database `muse_er` |
| `MUSE_ERD_Structure_Core.sql` | For the ER diagram | **Structure only, no data**: the 16 core tables with all columns, keys and the 24 relationships between them |
| `MUSE_ERD_Structure_Full.sql` | For the ER diagram | **Structure only, no data**: all 63 data tables with every key and all 124 relationships |
| `MUSE_Workbench_AppUser_OPTIONAL.sql` | Only if you run the web app | Creates the least-privilege account `muse_app`. **Edit the password first.** |

You need **MySQL Server 8.0.19 or newer** and **MySQL Workbench 8.0**.

---

## 1. Create the database

1. Open MySQL Workbench and click your local connection (usually *Local instance MySQL80*, user `root`).
2. Menu **File → Run SQL Script…**, choose `MUSE_Workbench_Setup.sql`, then click **Run**.
   - Alternative: **File → Open SQL Script…**, then click the lightning bolt ⚡ (*Execute all*).
   - Note: the script starts with `DROP DATABASE IF EXISTS muse`. Running it again resets everything to the original demo data.
3. In the left **Schemas** panel, click the refresh icon (🔄). `muse` appears.
4. The last result shows the check:

   | object | how_many |
   |--------|----------|
   | tables | 64 |
   | views | 19 |
   | functions + procedures | 22 |
   | triggers | 14 |
   | songs | 104 |
   | users | 13 |
   | listening_history rows | 2634 |

## 2. Run the live demo

Open `MUSE_Workbench_Demo.sql` and click ⚡. You will get several result tabs. The last tab is the
recommendation list: rank, song, artist, score and **why** it was recommended
(e.g. "Carries the Calm feel you asked for | New to you: you haven't played Konark Skyline yet").
Change `SET @mood = 'Calm';` to `Happy`, `Energetic`, `Sad`… and run it again for another list.

## 3. Show queries to the professor

Open `MUSE_Workbench_Queries.sql`. Put the cursor inside one query and press **Ctrl + Enter**
(runs only that query). The comment above each one says which concept it shows, for example
`-- Q15: Genre hierarchy with depth and path [RECURSIVE CTE]`.

Five queries return no rows on a fresh database, and that is correct: Q36 (sign-in sessions),
Q38 (dismissed songs) and Q41–Q42 (mood-match ratings) fill only when someone uses the web app;
Q29 fills after you run the demo. MUSE does not invent ratings: a song with no ratings shows none.

## 4. ER diagram inside Workbench

**Easiest (no data, no server needed):** **File → Import → Reverse Engineer MySQL Create Script…**
→ choose `MUSE_ERD_Structure_Core.sql` (16 tables) or `MUSE_ERD_Structure_Full.sql` (all tables)
→ tick **Place imported objects on a diagram** → **Execute → Next → Finish**. The EER diagram opens;
drag the tables into place, then **File → Export → Export as PNG / PDF**. These two files create their
own databases (`muse_erd_core`, `muse_erd`) if you run them, so your `muse` database is never touched.

In the 16-table file, foreign keys that point to tables outside the 16 (for example `users.role_id → roles`)
are left out so no line points to a missing table; the columns are still there. The list is at the end of the file.

**From the database with data:**

Workbench can draw the diagram from the real database:

1. **Database → Reverse Engineer…** → choose your connection → Next.
2. Tick **muse** → Next → Next.
3. On *Select Objects*, click **Show Filter**:
   - for the **full diagram**, keep all 64 tables;
   - for the **16-entity diagram**, move only these to the right: `users`, `user_profiles`, `artists`,
     `albums`, `songs`, `genres`, `song_genres`, `moods`, `song_moods`, `song_mood_ratings`, `listening_sessions`,
     `listening_history`, `recommendation_batches`, `recommendation_items`, `playlists`, `playlist_songs`.
4. **Execute → Next → Finish.** Arrange the tables, then **File → Export → Export as PNG / PDF**.

(The ready-made diagrams are in `docs/erd/`. `MUSE_ERD_Core.pdf` is the 16-entity one.)

## 5. Only if you run the web app

Open `MUSE_Workbench_AppUser_OPTIONAL.sql` and replace `CHANGE_ME_BEFORE_RUNNING` with your own
password. Click ⚡. Put the same password in `DB_APP_PASSWORD` in your `.env` (never commit `.env`).

The web app's weekly pipeline (MUSE Worlds and scheduled trend snapshots) is written in Node.js.
On a database made with these scripts, run it with `npm run pipeline --workspace backend` or from Admin in the app.

---

## Problems and fixes

| Message | Fix |
|---------|-----|
| `Error Code: 2013. Lost connection to MySQL server during query` | **Edit → Preferences → SQL Editor** → set *DBMS connection read timeout* to `600` → reconnect and run again |
| `Error Code: 1418 … binary logging is enabled` | Run once as root: `SET GLOBAL log_bin_trust_function_creators = 1;` then run the setup again |
| `Error Code: 1175 … safe update mode` | The scripts already switch Safe Updates off for themselves. If you typed your own UPDATE, use **Edit → Preferences → SQL Editor** → untick *Safe Updates* and reconnect |
| `Error Code: 1044 / 1227 access denied` | Connect as `root` (or an account that can create databases, routines, triggers and users) |
| Tables don't appear | Right-click in the Schemas panel → **Refresh All** |

## How these files were checked

- **Clean build:** `MUSE_Workbench_Setup.sql` was run on a fresh MySQL 8.0.46 server with Safe Updates on and with `log_bin_trust_function_creators = 0`. It finished with no errors.
- **Same as the app's own setup:** the database it builds was checked by `npm run db:verify`, which compares columns, indexes, constraints, views, routines, triggers and grants. It is structurally identical to the database built by `npm run db:setup`.
- **Queries:** all 47 blocks of the queries file pass (`npm run test:sql`). The demo procedures return a ranked list with reasons.

*TE:* Mundu Setup file run cheyyandi, tarvata Demo, tarvata Queries. Prati query ni Ctrl + Enter tho
okkokati ga run chesi professor ki chupinchandi.
