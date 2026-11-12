# MUSE — Phase 3: Querying & Interface

| Deliverable | Where |
|-------------|-------|
| SQL query file | `database/phase3/MUSE_Phase3_Queries.sql` — 17 queries (SELECT/WHERE, SUM/AVG/COUNT/MIN/MAX, GROUP BY/HAVING/ORDER BY, INNER/LEFT/RIGHT JOIN, plus subquery, CTEs and a window function) |
| Screenshots of query + output | `docs/phase3/screenshots/` — one PNG per query, plus dashboard, mood explorer and SQL playground |
| Project report (PDF) | `docs/phase3/MUSE_Phase3_Project_Report.pdf` |
| Frontend files | `phase3/app/` — Streamlit app `streamlit_app.py`, CLI `muse_cli.py`, shared `muse_queries.py` |

## 1. Database
Load `database/phase2/schema.sql` in MySQL Workbench 8.0 CE (File → Open SQL Script → ⚡). It creates `muse_db`.
Then open `database/phase3/MUSE_Phase3_Queries.sql` and run each query with **Ctrl + Enter**.

## 2. MUSE Query Studio (Streamlit)
```
cd phase3/app
pip install -r requirements.txt
cp .env.example .env            # enter your MySQL user and password (never commit .env)
streamlit run streamlit_app.py  # opens http://localhost:8501
```
Recommended: create the read-only account with `create_reader_user.sql` (edit the password first) and use it in `.env`.
Tabs: Dashboard · Query library · Mood explorer (parameterised query) · SQL playground (one read-only SELECT at a time).

## 3. Command line
```
python muse_cli.py list
python muse_cli.py run Q05
python muse_cli.py run all
python muse_cli.py sql "SELECT name FROM moods ORDER BY name"
```

## 4. Rebuild the test results, screenshots and report
```
python3 phase3/run_query_tests.py         # runs all queries, checks coverage and the read-only guard
python3 phase3/capture_screenshots.py     # needs the app running on http://localhost:8501
python3 phase3/build_phase3_report.py
```

Developed by Vaishnav Sai.
