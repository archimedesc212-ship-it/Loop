#!/usr/bin/env python3
"""
Phase 2 deliverable: Database Creation & Sample Data report (PDF).

Every number, constraint and test result in the report is read from
docs/phase2/.build/phase2-results.json, which `node backend/scripts/test-phase2-sql.js`
writes after really running the DDL, DML and constraint tests on MySQL.

  node backend/scripts/build-phase2-sql.js
  node backend/scripts/test-phase2-sql.js
  python3 backend/scripts/erd/build_phase2_report.py
  -> docs/phase2/MUSE_Phase2_Database_Creation_Report.pdf
"""
import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_core as C  # noqa: E402  (AREAS, DETAILS)
from build_phase1_report import CSS  # noqa: E402  (same look as the Phase 1 report)

from playwright.sync_api import sync_playwright  # noqa: E402
from pypdf import PdfReader  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT_DIR = os.path.join(ROOT, 'docs', 'phase2')
OUT = os.path.join(OUT_DIR, 'MUSE_Phase2_Database_Creation_Report.pdf')
R = json.load(open(os.path.join(OUT_DIR, '.build', 'phase2-results.json')))
TB = {t['t']: t for t in R['tables']}
e = html.escape

# table groups: each core entity with the supporting tables listed for it in build_core.DETAILS
GROUPS = []
for _, name, _, _, core in C.AREAS:
    members = []
    for t in core:
        members += [t] + C.DETAILS.get(t, [])
    GROUPS.append((name, members))
assert sorted(t for _, m in GROUPS for t in m) == sorted(TB), 'every table must be in exactly one group'

PURPOSE = {
    'Users': 'accounts, roles and permissions, profiles, languages and regions, sign-in sessions, audit log',
    'Music Catalogue': 'artists, albums, films, songs, genres, music sources and the import pipeline',
    'Mood Intelligence': 'moods, mood keywords and contexts, audio features, AI mood tags, model versions, user mood-match ratings',
    'Listening History': 'listening sessions, plays, playback events, ratings, likes, dismissals, searches, incognito sessions',
    'Recommendations': 'recommendation batches, ranked songs with reasons, weekly MUSE Worlds and their feedback',
    'Playlists': 'user playlists and their songs',
}


def kb(n):
    return f'{n / 1024:,.0f} KB' if n >= 1024 else f'{n} B'


def num(n):
    return f'{int(n):,}'


def group_tables():
    out = []
    for name, members in GROUPS:
        rows = ''.join(
            f'<tr><td><code>{t}</code></td><td class="c">{TB[t]["cols"]}</td><td><code>{e(TB[t]["pk"].replace(",", ", "))}</code></td>'
            f'<td class="c">{TB[t]["fk"]}</td><td class="c">{TB[t]["uq"]}</td><td class="c">{TB[t]["ck"]}</td>'
            f'<td class="c">{TB[t]["ix"]}</td><td class="c">{TB[t]["gen"] or ""}</td><td class="c">{num(TB[t]["rows"])}</td></tr>'
            for t in members)
        tot = lambda k: sum(TB[t][k] for t in members)  # noqa: E731
        out.append(f'''<h3>{e(name)} <span class="dim">— {len(members)} tables: {e(PURPOSE[name])}</span></h3>
<table class="t small"><tr><th>Table</th><th class="c">Cols</th><th>Primary key</th><th class="c">FK</th><th class="c">UK</th>
<th class="c">CHECK</th><th class="c">Indexes</th><th class="c">Gen.</th><th class="c">Rows</th></tr>{rows}
<tr class="grp"><td>Total</td><td class="c">{tot("cols")}</td><td></td><td class="c">{tot("fk")}</td><td class="c">{tot("uq")}</td>
<td class="c">{tot("ck")}</td><td class="c">{tot("ix")}</td><td class="c">{tot("gen")}</td><td class="c">{num(tot("rows"))}</td></tr></table>''')
    return '\n'.join(out)


def fk_table():
    rule = lambda r: 'RESTRICT' if r == 'NO ACTION' else r  # noqa: E731  (InnoDB treats NO ACTION as RESTRICT)
    rows = ''.join(
        f'<tr><td><code>{f["t"]}</code></td><td><code>{e(f["cols"].replace(",", ", "))}</code></td>'
        f'<td><code>{f["p"]}({e(f["pcols"].replace(",", ", "))})</code></td><td>{rule(f["d"])}</td><td>{rule(f["u"])}</td>'
        f'<td><code>{f["name"]}</code></td></tr>' for f in R['fks'])
    return f'''<table class="t small flat"><tr><th>Child table</th><th>Column(s)</th><th>References</th><th>ON DELETE</th>
<th>ON UPDATE</th><th>Constraint</th></tr>{rows}</table>'''


def check_table():
    rows = ''.join(f'<tr><td><code>{c["t"]}</code></td><td><code>{c["name"]}</code></td><td><code>{e(c["clause"].replace("_utf8mb4'", "'"))}</code></td></tr>'
                   for c in R['checks'])
    return f'<table class="t small flat"><tr><th>Table</th><th>Constraint</th><th>Condition</th></tr>{rows}</table>'


def sample(name, title):
    rows = R['samples'][name]
    if not rows:
        return ''
    head = ''.join(f'<th>{e(k)}</th>' for k in rows[0])
    body = ''.join('<tr>' + ''.join(f'<td>{e("NULL" if v is None else str(v))}</td>' for v in r.values()) + '</tr>' for r in rows)
    return f'<h4>{e(title)}</h4><table class="t small">{head and "<tr>" + head + "</tr>"}{body}</table>'


def sel(t):
    """rows of every SELECT in a test, in order"""
    return [s['rows'] for s in t['steps'] if s['ok'] and s.get('rows')]


# tests that must succeed, with the condition their results must meet
SUCCESS = {
    'T15': lambda r: int(r[0][0]['playlist_songs_before']) > 0 and int(r[1][0]['playlist_songs_after']) == 0,
    'T16': lambda r: int(r[0][0]['songs_on_album_1_before']) > 0 and int(r[1][0]['songs_on_album_1_after']) == 0
                     and int(r[1][0]['songs_total']) == TB['songs']['rows'],
    'T17': lambda r: all(x['normalized_title'] == x['title'].lower() for x in r[0]),
    'T18': lambda r: len(r[0]) == 1 and int(r[0][0]['is_active']) == 1 and int(r[0][0]['created_at_defaulted']) == 1,
}


def tests_table():
    out = []
    for t in R['tests']:
        res = []
        for s in t['steps']:
            if s['ok'] and s.get('rows'):
                r = s['rows'][0]
                res.append('✔ ' + e(', '.join(f'{k} = {v}' for k, v in r.items())))
            elif not s['ok']:
                res.append(f'<b>Rejected</b> — ERROR {s["code"]} ({s["state"]}): {e(s["message"])}')
        stmt = next((s['sql'] for s in t['steps'] if not s['sql'].startswith(('START', 'ROLLBACK', 'SELECT'))), t['steps'][0]['sql'])
        expect_fail = any(not s['ok'] for s in t['steps'])
        verdict = 'Pass' if (expect_fail if t['id'] not in SUCCESS else SUCCESS[t['id']](sel(t))) else 'Fail'
        out.append(f'<tr><td>{t["id"]}</td><td>{e(t["title"])}<br><code>{e(" ".join(stmt.split()))}</code></td>'
                   f'<td>{"<br>".join(res)}</td><td class="c">{verdict}</td></tr>')
    return ('<table class="t small"><tr><th>ID</th><th>What is tested · statement</th><th>Actual MySQL result</th><th class="c">Result</th></tr>'
            + ''.join(out) + '</table>')


def build_html():
    tables = R['tables']
    n_rows = sum(t['rows'] for t in tables)
    n_cols = sum(t['cols'] for t in tables)
    n_gen = sum(t['gen'] for t in tables)
    tot = R['totals']
    it = {x['k']: int(x['n']) for x in R['indexTypes']}
    rules = {}
    for x in R['fkRules']:
        d = 'RESTRICT' if x['d'] == 'NO ACTION' else x['d']
        rules[d] = rules.get(d, 0) + int(x['n'])
    biggest = sorted(tables, key=lambda t: -t['rows'])[:6]
    empty = [t['t'] for t in tables if t['rows'] == 0]
    struct = ''.join(f'<tr><td>{e(s["name"])}</td><td class="c">{s["compared"]}</td><td class="c">{s["onlyInMuse"] + s["onlyInMuseDb"]}</td></tr>'
                     for s in R['structure'])
    rejected = sum(1 for t in R['tests'] if any(not s['ok'] for s in t['steps']))
    files = R['sizes']
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>MUSE — Phase 2: Database Creation and Sample Data</title>
<style>{CSS}
.k2 td:first-child {{ width: 52mm; }}
</style></head><body>

<section class="cover">
 <div class="top">
  <div class="k">Database Management Systems · Project · Phase 2</div>
  <h1>MUSE — Music Mood Intelligence &amp; Recommendation Database System</h1>
  <div class="sub">Database Creation (DDL) and Sample Data (DML)</div>
 </div>
 <table>
  <tr><td>Submitted by</td><td>Vaishnav Sai</td></tr>
  <tr><td>Roll number</td><td>&#160;</td></tr>
  <tr><td>Programme</td><td>B.Tech CSE</td></tr>
  <tr><td>Course</td><td>Database Management Systems</td></tr>
  <tr><td>Submitted to</td><td>&#160;</td></tr>
  <tr><td>Date</td><td>&#160;</td></tr>
 </table>
 <div class="dim">DBMS: MySQL {e(R["server"].split("-")[0])} Community Server (InnoDB, utf8mb4), MySQL Workbench 8.0 CE.
 Every figure and test result in this report was produced by running the delivered scripts on that server.</div>
</section>

<h2 class="pb">1. What Phase 2 delivers</h2>
<p>Phase 1 designed the MUSE database (ER diagram and normalisation). Phase 2 creates it: the DDL script defines every table
with its columns, data types, primary keys, foreign keys, unique keys, CHECK constraints, defaults and indexes, and the DML
script fills it with enough sample data to test the design — {num(n_rows)} rows in {len(tables)} tables.</p>
<table class="t k2"><tr><th>File (folder <code>database/phase2/</code>)</th><th>Size</th><th>Purpose</th></tr>
<tr><td><code>MUSE_Phase2_DDL.sql</code></td><td>{kb(files["MUSE_Phase2_DDL.sql"])}</td><td>Creates database <code>muse_db</code> and all {len(tables)} tables with every key, constraint and index. Run first.</td></tr>
<tr><td><code>MUSE_Phase2_DML.sql</code></td><td>{kb(files["MUSE_Phase2_DML.sql"])}</td><td>INSERT statements for all tables ({num(n_rows)} rows). Run second.</td></tr>
<tr><td><code>MUSE_Phase2_Verify.sql</code></td><td>{kb(files["MUSE_Phase2_Verify.sql"])}</td><td>Read-only checks: table and constraint counts, rows per table, four join queries over the data.</td></tr>
<tr><td><code>MUSE_Phase2_Constraint_Tests.sql</code></td><td>{kb(files["MUSE_Phase2_Constraint_Tests.sql"])}</td><td>{len(R["tests"])} tests that try to break the constraints; changes that succeed are rolled back.</td></tr>
</table>
<p>The scripts are generated from the live project database by <code>backend/scripts/build-phase2-sql.js</code>, so the DDL
is exactly the schema the MUSE web application uses. They use their own database, <code>muse_db</code>, so the application's
<code>muse</code> database is never touched.</p>

<h3>1.1 How to run in MySQL Workbench 8.0 CE</h3>
<ol>
<li>Open Workbench and connect to your local server as <code>root</code> (or any account that can create databases).</li>
<li><b>File → Open SQL Script…</b> → <code>MUSE_Phase2_DDL.sql</code> → click the lightning bolt (Execute all). Refresh the
<i>Schemas</i> panel: <code>muse_db</code> appears with {len(tables)} tables.</li>
<li>Open <code>MUSE_Phase2_DML.sql</code> and execute it the same way (about a second on the test machine).</li>
<li>Open <code>MUSE_Phase2_Verify.sql</code> and execute it; each result tab shows one check.</li>
<li>Open <code>MUSE_Phase2_Constraint_Tests.sql</code>. Most of its statements are <i>meant</i> to fail, and Workbench
stops at the first error, so either run them one at a time (cursor on the statement, <b>Ctrl + Enter</b>) or switch on
<i>Continue on SQL Script Error</i> in the SQL editor toolbar before Execute all.</li>
</ol>
<p>The DDL starts with <code>DROP DATABASE IF EXISTS muse_db</code>, so running DDL then DML again always gives a clean copy.
Requirements: MySQL Server 8.0.16 or newer (CHECK constraints are enforced from 8.0.16).</p>

<h2>2. Schema created by the DDL</h2>
<table class="t"><tr><th>Object</th><th class="c">Count</th><th>Notes</th></tr>
<tr><td>Tables</td><td class="c">{len(tables)}</td><td>All InnoDB, character set utf8mb4, collation utf8mb4_0900_ai_ci</td></tr>
<tr><td>Columns</td><td class="c">{n_cols}</td><td>Including {n_gen} generated (derived) columns, computed by MySQL</td></tr>
<tr><td>Primary keys</td><td class="c">{tot.get("PRIMARY KEY", 0)}</td><td>One per table; surrogate AUTO_INCREMENT keys for entities, composite keys for associative tables</td></tr>
<tr><td>Foreign keys</td><td class="c">{tot.get("FOREIGN KEY", 0)}</td><td>{", ".join(f"{v} {k}" for k, v in sorted(rules.items(), key=lambda x: -x[1]))} on delete</td></tr>
<tr><td>Unique keys</td><td class="c">{tot.get("UNIQUE", 0)}</td><td>Candidate (alternate) keys, e.g. <code>users.username</code>, <code>users.email</code>, <code>moods.name</code></td></tr>
<tr><td>CHECK constraints</td><td class="c">{tot.get("CHECK", 0)}</td><td>Value ranges, formats (regular expressions) and rules between columns</td></tr>
<tr><td>Indexes</td><td class="c">{R["indexes"]}</td><td>{it.get("PRIMARY", 0)} primary, {it.get("UNIQUE", 0)} unique, {it.get("ordinary", 0)} ordinary, {it.get("FULLTEXT", 0)} FULLTEXT (ngram parser, for Indian-language titles)</td></tr>
</table>

<h3>2.1 Design rules used in the DDL</h3>
<ul>
<li><b>NOT NULL by default.</b> A column is nullable only when "unknown" or "not applicable" is a real state
(e.g. <code>songs.album_id</code> for a single, <code>listening_history.ended_at</code> while a song is still playing).</li>
<li><b>Smallest exact type.</b> Lookup keys are <code>TINYINT</code>/<code>SMALLINT UNSIGNED</code>; high-volume event keys are
<code>BIGINT UNSIGNED</code>; scores are <code>DECIMAL</code> (no rounding errors); fixed lists are <code>ENUM</code>.</li>
<li><b>Foreign-key actions chosen per relationship.</b> CASCADE where the child cannot exist alone (a playlist's songs);
SET NULL where the child stays meaningful (a song whose album is removed); RESTRICT where deleting the parent would
destroy history (a role still in use, a listener with a weekly MUSE World).</li>
<li><b>Rules in the database, not only in the app.</b> CHECK constraints keep ratings in 1–5, confidences in (0, 1],
hex colours valid, end times after start times, and stop a play being both completed and skipped.</li>
<li><b>Derived values as generated columns.</b> For example <code>albums.normalized_title</code> (lower-cased title without
punctuation, used for duplicate detection) is computed by MySQL and cannot be written directly.</li>
<li><b>Naming.</b> <code>pk</code> = <code>&lt;entity&gt;_id</code>; constraints are named <code>fk_…</code>, <code>uq_…</code>,
<code>chk_…</code>, indexes <code>idx_…</code>, so every error message names the rule that was broken.</li>
</ul>

<h3>2.2 Tables by area</h3>
<p class="dim">Cols = columns · FK = foreign keys · UK = unique keys · Gen. = generated columns · Rows = sample rows loaded by the DML.</p>
{group_tables()}

<h2 class="pb">3. Constraint catalogue</h2>
<h3>3.1 Foreign keys ({len(R["fks"])})</h3>
<p>In InnoDB, <code>NO ACTION</code> behaves exactly like <code>RESTRICT</code>, so it is shown as RESTRICT.</p>
{fk_table()}
<h3>3.2 CHECK constraints ({len(R["checks"])})</h3>
{check_table()}

<h2 class="pb">4. Sample data (DML)</h2>
<p>The DML inserts the MUSE demo data set: {num(n_rows)} rows. It is the same data the web application's own setup
(<code>npm run db:setup</code>) creates — demo users, a catalogue of {num(TB["songs"]["rows"])} songs by
{num(TB["artists"]["rows"])} artists in {num(TB["languages"]["rows"])} languages, mood analysis for every song,
{num(TB["listening_history"]["rows"])} plays in {num(TB["listening_sessions"]["rows"])} listening sessions, recommendations with
reasons, and playlists. Generated columns are not in the INSERTs; MySQL computes them. The script switches
<code>FOREIGN_KEY_CHECKS</code> off while loading, because some tables refer to themselves (genre → parent genre,
pipeline job → parent job), and on again at the end; section 5.3 shows that no row breaks a foreign key.</p>
<p>Largest tables: {", ".join(f"<code>{t['t']}</code> ({num(t['rows'])})" for t in biggest)}.
{f"Empty on purpose: {', '.join(f'<code>{t}</code>' for t in empty)} — they fill only while the web application is used (sign-in sessions, mood-match ratings, review queue …); the design does not invent such rows." if empty else ""}</p>
<p>Password hashes in <code>users</code> are bcrypt hashes of demo passwords; no real personal data is included.</p>
{sample("users", "users (with role and profile)")}
{sample("songs", "songs (with artist, album, language)")}
{sample("moods", "moods (target audio profile of each mood)")}
{sample("song_moods", "song_moods (mood tags from the active model)")}
{sample("listening_history", "listening_history (plays)")}
{sample("playlists", "playlists")}

<h2 class="pb">5. Testing</h2>
<p style="text-align:left">Test machine: MySQL {e(R["server"])} with the default strict <code>sql_mode</code>:<br>
<code style="font-size:7.4pt">{e(R["sqlMode"])}</code></p>
<p>The DDL ran in {R["ddlMs"] / 1000:.1f} s and the DML in {R["dmlMs"] / 1000:.1f} s, both without errors. All results below
come from <code>backend/scripts/test-phase2-sql.js</code>, which loads the two scripts into <code>muse_db</code> and compares
it with the application database <code>muse</code> built by the project's migrations.</p>

<h3>5.1 Structure: DDL result vs. the application schema</h3>
<table class="t"><tr><th>Compared from information_schema</th><th class="c">Items</th><th class="c">Differences</th></tr>{struct}</table>

<h3>5.2 Data: DML result vs. the application data</h3>
<table class="t"><tr><th>Check</th><th>Result</th></tr>
<tr><td>Row count of every table</td><td>{len(tables)} tables compared, {R["rowMismatch"]} different</td></tr>
<tr><td><code>CHECKSUM TABLE</code> of every table (all column values)</td><td>{len(tables)} tables compared, {R["checksumMismatch"]} different</td></tr>
<tr><td>Generated columns</td><td>Recomputed by MySQL from the inserted data; included in the checksums above, so they match the application values</td></tr>
</table>

<h3>5.3 Referential integrity</h3>
<p>For each of the {R["fkChecked"]} foreign keys, a query counted child rows whose non-NULL key value has no matching parent row.
Result: <b>{R["orphanRows"]} orphan rows</b>.</p>

<h3>5.4 Constraint tests</h3>
<p>Each test tries to store something the design forbids, or checks a referential action. {rejected} statements were rejected by
MySQL with the error shown. Tests T15–T18 must succeed: each is passed only if its before/after values are as expected, and their changes are rolled back. After all tests, the checksums of every table were
compared again with <code>muse</code>: {"no data was changed" if R["unchangedAfterTests"] else "DATA CHANGED"}.</p>
{tests_table()}

<h2>6. Notes and limits</h2>
<ul>
<li>Phase 2 covers tables, keys, constraints and indexes. The 20 views, 22 stored functions and procedures and 14 triggers
of MUSE are created by <code>database/workbench/MUSE_Workbench_Setup.sql</code> (the full build) and belong to the
query and programming phase.</li>
<li>The tests show that the constraints listed here are enforced by MySQL; they do not prove that the design is free of every
possible error, and the sample data is demo data, not a production workload.</li>
<li>The FULLTEXT indexes use the <code>ngram</code> parser, which ships with MySQL 8.0; on other database systems these four
indexes would need another full-text method.</li>
</ul>
<p class="dim">Developed by Vaishnav Sai.</p>
</body></html>'''


def main():
    bad = [s for s in R['structure'] if s['onlyInMuse'] or s['onlyInMuseDb']]
    if bad or R['rowMismatch'] or R['checksumMismatch'] or R['orphanRows'] or not R['unchangedAfterTests']:
        sys.exit('test results contain failures; fix them before building the report')
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(OUT_DIR, '.report.html')
    open(tmp, 'w', encoding='utf-8').write(build_html())
    footer = ('<div style="font-family:Liberation Sans,Arial;font-size:7.5px;color:#777;width:100%;padding:0 12mm;display:flex;'
              'justify-content:space-between"><span>MUSE — Phase 2: Database Creation and Sample Data</span>'
              '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto('file://' + tmp)
        pg.wait_for_timeout(300)
        pg.pdf(path=OUT, prefer_css_page_size=True, print_background=True, display_header_footer=True,
               header_template='<span></span>', footer_template=footer)
        b.close()
    os.remove(tmp)
    r = PdfReader(OUT)
    text = ' '.join(x.extract_text() or '' for x in r.pages)
    missing = [t for t in TB if t not in text]
    print(f'{OUT}: {len(r.pages)} pages; tables not found as text: {missing}')
    if missing:
        sys.exit(1)


if __name__ == '__main__':
    main()
