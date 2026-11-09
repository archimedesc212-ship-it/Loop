# MUSE Query Studio — HTML interface

Plain HTML + CSS + JavaScript front end (`static/`) with a small Flask server (`server.py`) that runs the
Phase 3 queries on MySQL. The browser never connects to MySQL itself; it calls the JSON API below.

## Run (live)
1. Load `database/phase2/schema.sql` in MySQL Workbench (creates `muse_db`).
2. In `phase3/app`, copy `.env.example` to `.env` and enter your MySQL user and password
   (recommended: the read-only `muse_reader` from `create_reader_user.sql`).
3. In this folder:
   ```
   pip install -r requirements.txt
   python server.py
   ```
4. Open http://127.0.0.1:5000

Tabs: Dashboard · Query library (all 17 queries: SQL, table, chart, CSV) · Mood explorer (parameterised query) ·
SQL playground (one read-only SELECT at a time; runs in START TRANSACTION READ ONLY).

## Offline file
`MUSE_Query_Studio_offline.html` is one self-contained file that opens without a server. It holds real results
saved from MySQL by `python build_offline_html.py`, shows when they were saved, and switches the SQL playground off.

## API
| Method | Path | Returns |
|---|---|---|
| GET | `/api/status` | connection, MySQL version, database, table count |
| GET | `/api/queries` | the 17 queries with their headers |
| GET | `/api/run/<id>` | columns, rows, time for one query |
| GET | `/api/moods`, `/api/mood?mood=&min=&lang=` | mood explorer lists and results |
| POST | `/api/sql` `{"sql": "..."}` | result of one read-only SELECT, or the error |

Developed by Vaishnav Sai.
