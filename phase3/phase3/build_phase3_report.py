#!/usr/bin/env python3
"""
Phase 3 deliverable: Querying & Interface report (PDF).

Every query, output and test figure comes from docs/phase3/.build/query-results.json (written by
phase3/run_query_tests.py after really running the queries), the schema figures from the Phase 2 test results,
and the screenshots are real captures of the running Streamlit app (phase3/capture_screenshots.py).

  python3 phase3/run_query_tests.py && python3 phase3/capture_screenshots.py && python3 phase3/build_phase3_report.py
  -> docs/phase3/MUSE_Phase3_Project_Report.pdf
Developed by Vaishnav Sai.
"""
import html
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend' / 'scripts' / 'erd'))
import build_core as C  # noqa: E402  (AREAS, DETAILS)
from build_phase1_report import CSS  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402
from pypdf import PdfReader  # noqa: E402

OUT_DIR = ROOT / 'docs' / 'phase3'
OUT = OUT_DIR / 'MUSE_Phase3_Project_Report.pdf'
SHOTS = OUT_DIR / 'screenshots'
R = json.load(open(OUT_DIR / '.build' / 'query-results.json'))
P2 = json.load(open(ROOT / 'docs' / 'phase2' / '.build' / 'phase2-results.json'))
TB = {t['t']: t for t in P2['tables']}
e = html.escape
CREDIT = 'Developed by Vaishnav Sai'

AREA_TEXT = {
    'Users': 'accounts, roles, permissions, profiles, languages, regions, sign-in sessions, audit log',
    'Music Catalogue': 'artists, albums, films, songs, genres, music sources, import pipeline',
    'Mood Intelligence': 'moods, contexts, audio features, AI mood tags with model versions, user mood-match ratings',
    'Listening History': 'sessions, plays, playback events, ratings, likes, dismissals, searches',
    'Recommendations': 'recommendation batches, ranked songs with reasons, weekly MUSE Worlds',
    'Playlists': 'user playlists and their songs',
}
REQUIRED = ['SELECT', 'WHERE', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'GROUP BY', 'HAVING', 'ORDER BY', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN']
EXTRA = ['Subquery', 'CTE (WITH)', 'Window function']


def fmt(v):
    if v is None:
        return '<span class="dim">NULL</span>'
    if isinstance(v, float):
        return f'{v:g}'
    return e(str(v))


def out_table(q, n=8):
    head = ''.join(f'<th>{e(c)}</th>' for c in q['columns'])
    body = ''.join('<tr>' + ''.join(f'<td>{fmt(v)}</td>' for v in r) + '</tr>' for r in q['sample'][:n])
    more = f'<div class="dim">… {q["rows"] - n} more rows (all rows in the screenshot and the app)</div>' if q['rows'] > n else ''
    return f'<table class="t small out"><tr>{head}</tr>{body}</table>{more}'


def shot_file(q):
    name = f'{q["id"]}_' + q['title'].lower().replace(' ', '_').replace("'", '').replace(',', '').replace('-', '_') + '.png'
    return SHOTS / name


def queries_html():
    out = []
    for q in R['queries']:
        chips = ''.join(f'<span class="chip">{e(c)}</span>' for c in q['concepts'])
        f = shot_file(q)
        out.append(f'''<div class="q">
<h3>{q["id"]} · {e(q["title"])}</h3>
<p class="question">{e(q["question"])}</p>
<div>{chips}</div>
<pre class="sql">{e(q["sql"])};</pre>
<div class="dim">Output: {q["rows"]} row{"s" if q["rows"] != 1 else ""} in {q["ms"]:.1f} ms · screenshot <code>{e(f.name) if f.exists() else "—"}</code></div>
{out_table(q)}
</div>''')
    return '\n'.join(out)


def coverage_html():
    ids = [q['id'] for q in R['queries']]
    head = '<tr><th>Concept</th>' + ''.join(f'<th class="c">{i[1:]}</th>' for i in ids) + '<th class="c">#</th></tr>'
    rows = ''
    for k in REQUIRED + EXTRA:
        hit = set(R['coverage'][k])
        rows += (f'<tr{" class=extra" if k in EXTRA else ""}><td>{e(k)}</td>' + ''.join(f'<td class="c">{"●" if i in hit else ""}</td>' for i in ids)
                 + f'<td class="c"><b>{len(hit)}</b></td></tr>')
    return f'<table class="t small cov">{head}{rows}</table>'


def img(name, caption, cls='shot'):
    p = SHOTS / name
    if not p.exists():
        sys.exit(f'missing screenshot {p}; run phase3/capture_screenshots.py')
    return f'<figure class="{cls}"><img src="{p.as_uri()}"><figcaption>{e(caption)}</figcaption></figure>'


def build_html():
    groups = []
    for _, name, _, _, core in C.AREAS:
        members = [x for t in core for x in [t] + C.DETAILS.get(t, [])]
        groups.append((name, len(members), sum(TB[t]['rows'] for t in members)))
    n_rows = sum(t['rows'] for t in P2['tables'])
    tot = P2['totals']
    big = sorted(P2['tables'], key=lambda t: -t['rows'])
    key_tables = ['users', 'artists', 'albums', 'songs', 'moods', 'song_moods', 'audio_features', 'listening_sessions', 'listening_history',
                  'ratings', 'playlists', 'playlist_songs', 'recommendation_items', 'weekly_worlds']
    erd = f'<img src="{(ROOT / "docs" / "erd" / "MUSE_ERD_Core.svg").as_uri()}">'
    tests = ''.join(f'<tr><td>{q["id"]}</td><td>{e(q["title"])}</td><td class="c">{q["rows"]}</td><td class="c">{q["ms"]:.1f}</td>'
                    f'<td class="c">{"Pass" if q["ok"] else "Fail"}</td></tr>' for q in R['queries'])
    guard = ''.join(f'<tr><td><code>{e(g["sql"])}</code></td><td>{"Rejected — " + e(g["message"]) if g["blocked"] else "NOT rejected"}</td></tr>'
                    for g in R['guard'])
    passed = sum(q['ok'] for q in R['queries'])
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>MUSE — Phase 3: Querying and Interface</title>
<style>{CSS}
.q {{ break-inside: avoid-page; margin-bottom: 6mm; }}
.q h3 {{ margin-top: 2mm; }}
.question {{ font-style: italic; margin-bottom: 1.2mm; }}
.chip {{ display: inline-block; font-family: "Liberation Sans", Arial, sans-serif; font-size: 7.4pt; padding: 0.3mm 2mm; margin: 0 1mm 1mm 0;
         border: 0.6px solid #8a7bb5; border-radius: 3mm; color: #3d2f6b; background: #f3effb; }}
pre.sql {{ font-family: "Liberation Mono", monospace; font-size: 7.6pt; line-height: 1.32; background: #f5f5f7; border-left: 3px solid #7d5ba6;
           padding: 2mm 3mm; margin: 1.5mm 0 1.5mm; white-space: pre-wrap; break-inside: avoid; }}
table.out td, table.out th {{ white-space: nowrap; max-width: 52mm; overflow: hidden; text-overflow: ellipsis; }}
table.cov td, table.cov th {{ padding: 0.8mm 0.9mm; }}
tr.extra td {{ color: #555; }}
figure.shot {{ margin: 3mm 0 5mm; break-inside: avoid; text-align: center; }}
figure.shot img {{ max-width: 100%; max-height: 222mm; border: 0.6px solid #999; }}
figure.half img {{ max-height: 120mm; }}
figcaption {{ font-family: "Liberation Sans", Arial, sans-serif; font-size: 8pt; color: #555; margin-top: 1.2mm; }}
.erd {{ break-inside: avoid; }} .erd img {{ width: 100%; height: auto; max-height: 190mm; object-fit: contain; border: 0.6px solid #bbb; }}
</style></head><body>

<section class="cover">
 <div class="top">
  <div class="k">Database Management Systems · Project · Phase 3</div>
  <h1>MUSE — Music Mood Intelligence &amp; Recommendation Database System</h1>
  <div class="sub">Querying, Interface and Project Report</div>
 </div>
 <table>
  <tr><td>Submitted by</td><td>Vaishnav Sai</td></tr>
  <tr><td>Roll number</td><td>&#160;</td></tr>
  <tr><td>Programme</td><td>B.Tech CSE</td></tr>
  <tr><td>Course</td><td>Database Management Systems</td></tr>
  <tr><td>Submitted to</td><td>&#160;</td></tr>
  <tr><td>Date</td><td>&#160;</td></tr>
 </table>
 <div class="dim">MySQL {e(R["server"].split("-")[0])} Community Server · MySQL Workbench 8.0 CE · Streamlit interface.
 All outputs in this report were produced by running the queries on the Phase 2 database.</div>
</section>

<h2 class="pb">1. Project summary</h2>
<p><b>MUSE</b> is a database for a music service that understands <i>mood</i>. Every song has measured audio features
(energy, valence/positivity, danceability, acousticness, tempo). A versioned mood model turns these into mood tags with a
confidence, listeners' plays, skips, ratings and playlists are recorded, and the system builds explainable recommendations
and a weekly personalised "MUSE World" from them. The catalogue is Indian multilingual music
({TB["languages"]["rows"]} languages), so the design also handles scripts, regions and film soundtracks.</p>
<p>Phase 1 designed the ER model and normalised it; Phase 2 created the schema (DDL) and loaded sample data (DML).
This phase adds {len(R["queries"])} queries that answer real questions about the data, an interface that runs them and shows the
results as tables and charts, and this report.</p>

<table class="t"><tr><th>Phase 3 deliverable</th><th>File</th></tr>
<tr><td>SQL query file</td><td><code>database/phase3/MUSE_Phase3_Queries.sql</code> — {len(R["queries"])} queries with headers; runs in Workbench (Ctrl + Enter per query)</td></tr>
<tr><td>Screenshots of query + output</td><td><code>docs/phase3/screenshots/</code> — one per query plus the dashboard, mood explorer and SQL playground ({len(list(SHOTS.glob("*.png")))} PNG files)</td></tr>
<tr><td>Project report (PDF)</td><td>this document</td></tr>
<tr><td>Frontend files</td><td><code>phase3/app/</code> — <code>streamlit_app.py</code> (MUSE Query Studio), <code>muse_cli.py</code> (command line), <code>muse_queries.py</code>, <code>requirements.txt</code>, <code>.env.example</code></td></tr>
</table>

<h2>2. Schema</h2>
<p>The database <code>muse_db</code> has {len(P2["tables"])} tables in six areas, with {tot["PRIMARY KEY"]} primary keys,
{tot["FOREIGN KEY"]} foreign keys, {tot["UNIQUE"]} unique keys and {tot["CHECK"]} CHECK constraints (full catalogue in the Phase 2 report).</p>
<table class="t"><tr><th>Area</th><th class="c">Tables</th><th class="c">Rows</th><th>Contents</th></tr>
{"".join(f"<tr><td>{e(n)}</td><td class='c'>{k}</td><td class='c'>{r:,}</td><td>{e(AREA_TEXT[n])}</td></tr>" for n, k, r in groups)}
<tr class="grp"><td>Total</td><td class="c">{len(P2["tables"])}</td><td class="c">{n_rows:,}</td><td></td></tr></table>
<p>The core entities and their relationships (16 central tables; generated from the live schema):</p>
<div class="erd">{erd}</div>

<h2 class="pb">3. Sample data</h2>
<p>{n_rows:,} rows are loaded by <code>schema.sql</code>: {TB["users"]["rows"]} users (one admin, one curator and
{TB["users"]["rows"] - 2} listeners), {TB["songs"]["rows"]} songs by {TB["artists"]["rows"]} artists on {TB["albums"]["rows"]} albums,
{TB["song_moods"]["rows"]} mood tags, {TB["listening_sessions"]["rows"]} listening sessions with {TB["listening_history"]["rows"]:,} plays
and {TB["playback_events"]["rows"]:,} playback events, {TB["ratings"]["rows"]} star ratings, {TB["playlists"]["rows"]} playlists and
{TB["recommendation_items"]["rows"]} recommended songs with {TB["recommendation_reasons"]["rows"]} reasons. The data is demo data made for
the project (no real people).</p>
<table class="t small"><tr><th>Table</th><th class="c">Rows</th><th>Table</th><th class="c">Rows</th></tr>
{"".join(f"<tr><td><code>{a}</code></td><td class='c'>{TB[a]['rows']:,}</td><td><code>{b}</code></td><td class='c'>{TB[b]['rows']:,}</td></tr>" for a, b in zip(key_tables[::2], key_tables[1::2]))}
</table>
<p class="dim">Largest tables: {", ".join(f"{t['t']} ({t['rows']:,})" for t in big[:5])}.</p>

<h2>4. Queries and outputs</h2>
<p>All queries are in <code>MUSE_Phase3_Queries.sql</code>. Each has a header (<code>-- @id</code>, <code>@title</code>,
<code>@concepts</code>, <code>@question</code>) that the interface reads, so the file is the single source for Workbench, the
Streamlit app and the CLI. Below, each query is shown with its first rows of real output; the screenshots show the complete output.</p>
<h3>4.1 Coverage of the required concepts</h3>
<p>● = used in that query. Every required concept is covered by at least one query; the last three rows are additional techniques.</p>
{coverage_html()}
<div class="pb"></div>
{queries_html()}

<h2 class="pb">5. Interface — MUSE Query Studio</h2>
<p>A Streamlit web app (<code>phase3/app/streamlit_app.py</code>) connects to <code>muse_db</code> and has four tabs:</p>
<ul>
<li><b>Dashboard</b> — headline figures (Q03) and charts for listening by hour (Q13), the mood map (Q07), listening by context (Q11)
and each listener's favourite mood (Q16).</li>
<li><b>Query library</b> — pick any of the {len(R["queries"])} queries: the question, the concepts it uses, the SQL, and the result as a
table and (where useful) a chart, with row count, run time and a CSV download.</li>
<li><b>Mood explorer</b> — choose a mood, a minimum confidence and a language; a <i>parameterised</i> query (values sent separately
from the SQL) lists matching songs and plots them by energy and positivity.</li>
<li><b>SQL playground</b> — type your own SELECT. Only one SELECT/WITH statement is accepted, and it runs inside
<code>START TRANSACTION READ ONLY</code>; the recommended account <code>muse_reader</code> also has SELECT privilege only.</li>
</ul>
<p><b>Run it:</b> load <code>database/phase2/schema.sql</code> in Workbench, then in <code>phase3/app</code>:
<code>pip install -r requirements.txt</code>, copy <code>.env.example</code> to <code>.env</code> and enter your MySQL user and password
(optionally create the read-only user with <code>create_reader_user.sql</code>), and run <code>streamlit run streamlit_app.py</code>.
The same queries run in a terminal with <code>python muse_cli.py run Q05</code> (or <code>list</code>, <code>run all</code>).</p>
{img("00_dashboard.png", "Dashboard tab (real screenshot of the running app)")}
{img("Q05_artists_with_a_strong_catalogue.png", "Query library: Q05 with its SQL, output table and chart")}
{img("18_mood_explorer.png", "Mood explorer: parameterised query for the mood Calm")}
{img("20_sql_playground_blocked.png", "SQL playground refusing a DELETE statement", "shot half")}

<h2 class="pb">6. Testing</h2>
<p>Each query was run on MySQL {e(R["server"])} as user <code>{e(R["user"])}</code> (read-only) by
<code>phase3/run_query_tests.py</code>, which uses the same code as the app. A query passes if it runs without error and returns at
least one row. The whole query file was also executed in the MySQL command-line client without errors, and every screenshot was
taken from the running app. Result: <b>{passed} of {len(R["queries"])} queries pass</b>.</p>
<table class="t small"><tr><th>ID</th><th>Query</th><th class="c">Rows</th><th class="c">ms</th><th class="c">Result</th></tr>{tests}</table>
<h3>Read-only guard</h3>
<table class="t small"><tr><th>Statement tried in the interface</th><th>Result</th></tr>{guard}</table>
<p class="dim">These tests used the MySQL command-line client and the app. MySQL Workbench 8.0 CE sends the same statements to the
same MySQL 8.0 server, and the file uses only standard MySQL 8.0 syntax.</p>

<h2>7. Conclusion</h2>
<p>The MUSE database answers questions a real music service would ask — what people listen to and when, which songs they skip, how
the catalogue spreads across moods and languages, and how strong the weekly recommendations are — using the SELECT, WHERE, aggregate,
GROUP BY / HAVING / ORDER BY and INNER / LEFT / RIGHT JOIN queries required by the brief, plus a subquery, CTEs and a window function.
The Streamlit interface makes the same queries usable without writing SQL, while keeping the database read-only.</p>
<p class="dim">{CREDIT}.</p>
</body></html>'''


def main():
    if R['failures']:
        sys.exit(f'query tests failed: {R["failures"]}')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = OUT_DIR / '.report.html'
    tmp.write_text(build_html(), encoding='utf-8')
    footer = ('<div style="font-family:Liberation Sans,Arial;font-size:7.5px;color:#777;width:100%;padding:0 12mm;display:flex;'
              'justify-content:space-between"><span>MUSE — Phase 3: Querying and Interface</span>'
              '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(tmp.as_uri())
        pg.wait_for_timeout(500)
        pg.pdf(path=str(OUT), prefer_css_page_size=True, print_background=True, display_header_footer=True,
               header_template='<span></span>', footer_template=footer)
        b.close()
    os.remove(tmp)
    r = PdfReader(str(OUT))
    text = ' '.join(x.extract_text() or '' for x in r.pages)
    missing = [q['id'] for q in R['queries'] if f'{q["id"]} ·' not in text]
    print(f'{OUT}: {len(r.pages)} pages; queries missing from text: {missing}')
    if missing:
        sys.exit(1)


if __name__ == '__main__':
    main()
