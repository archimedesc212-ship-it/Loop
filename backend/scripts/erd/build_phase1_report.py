#!/usr/bin/env python3
"""
Phase 1 deliverable: ER diagram + normalisation report (PDF).

Every entity, attribute, key and relationship in the report is read from
docs/erd/schema-model.json (extracted from the live MySQL schema by
extract-schema.js), and the diagrams are the generated docs/erd SVGs, so the
report cannot drift from the database. Run after `npm run docs:erd`:

  python3 backend/scripts/erd/build_phase1_report.py
  -> docs/phase1/MUSE_Phase1_ER_Normalisation_Report.pdf
"""
import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_core as C  # noqa: E402  (LABELS, AREAS, CORE, DETAILS)
import build_chen as CH  # noqa: E402  (Chen-notation model: ENTITIES, RELS)

from playwright.sync_api import sync_playwright  # noqa: E402
from pypdf import PdfReader  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ERD = os.path.join(ROOT, 'docs', 'erd')
OUT_DIR = os.path.join(ROOT, 'docs', 'phase1')
OUT = os.path.join(OUT_DIR, 'MUSE_Phase1_ER_Normalisation_Report.pdf')
M = json.load(open(os.path.join(ERD, 'schema-model.json')))
T = M['tables']
CORE = C.CORE
e = html.escape

# ----------------------------------------------------------------- hand-written meaning of each entity
ENTITY = {
    'users': ('User', 'A login account of a listener, curator or admin.'),
    'user_profiles': ('User profile', 'Display and personal settings of one user (split 1:1 from the account).'),
    'artists': ('Artist', 'A singer, band or composer.'),
    'albums': ('Album', 'An album, EP, single or film soundtrack.'),
    'songs': ('Song', 'One track in the catalogue.'),
    'genres': ('Genre', 'A music genre; genres form a hierarchy (sub-genre of).'),
    'song_genres': ('Song–Genre (associative)', 'Resolves the M:N between songs and genres.'),
    'moods': ('Mood', 'A mood such as Calm or Energetic, with its target audio profile.'),
    'song_moods': ('Song–Mood (associative)', 'Resolves the M:N between songs and moods; one row per song, mood and analysing model.'),
    'listening_sessions': ('Listening session', 'One continuous period of listening by a user.'),
    'listening_history': ('Play (listening history)', 'One play of one song inside a session.'),
    'recommendation_batches': ('Recommendation batch', 'One request for recommendations and the targets it used.'),
    'recommendation_items': ('Recommended song (associative)', 'One ranked song in a batch, with all its scores; resolves batch M:N song.'),
    'playlists': ('Playlist', 'A user-owned playlist.'),
    'playlist_songs': ('Playlist–Song (associative)', 'Resolves the M:N between playlists and songs.'),
    'song_mood_ratings': ('Mood-match rating (associative)', "One user's 0–100 % judgement of how well one song fits one mood (ternary User–Song–Mood). Separate from the AI's song_moods."),
}
SING = {'users': 'user', 'user_profiles': 'user profile', 'artists': 'artist', 'albums': 'album', 'songs': 'song', 'genres': 'genre',
        'song_genres': 'song-genre row', 'moods': 'mood', 'song_moods': 'song-mood row', 'listening_sessions': 'session',
        'listening_history': 'play', 'recommendation_batches': 'batch', 'recommendation_items': 'recommended song',
        'playlists': 'playlist', 'playlist_songs': 'playlist entry', 'song_mood_ratings': 'mood-match rating'}

def plural(w):
    if w.endswith('ch'):
        return w + 'es'
    if w.endswith('y') and w[-2] not in 'aeiou':
        return w[:-1] + 'ies'
    return w + 's'


# derived attributes: (table, column) -> how the value is produced
DERIVED = {
    ('songs', 'normalized_title'): 'generated column (from title)',
    ('artists', 'normalized_name'): 'generated column (from name)',
    ('albums', 'normalized_title'): 'generated column (from title)',
    ('song_genres', 'primary_song_key'): 'generated column (song_id when is_primary)',
    ('listening_history', 'completion_pct'): 'set by trigger from listened_sec and song duration',
    ('listening_history', 'completed'): 'set by trigger',
    ('listening_history', 'skipped'): 'set by trigger',
    ('listening_history', 'is_replay'): 'set by trigger',
    ('playlists', 'song_count'): 'maintained by triggers on playlist_songs',
    ('playlists', 'total_duration_sec'): 'maintained by triggers on playlist_songs',
    ('listening_sessions', 'plays'): 'aggregate of the session\'s plays',
    ('listening_sessions', 'listen_sec'): 'aggregate of the session\'s plays',
}


def check_derived():
    for (t, c) in DERIVED:
        if c not in [x['name'] for x in T[t]['columns']]:
            sys.exit(f'derived column {t}.{c} not in schema')


def fk_of(t):
    out = {}
    for f in T[t]['fks']:
        for c in f['cols']:
            out.setdefault(c, f)
    return out


def ukeys(t):
    return [u for u in T[t]['uniques']]


def cols(t):
    return [c['name'] for c in T[t]['columns']]


def short(tp):
    tp = tp.replace(' unsigned', '')
    if tp.startswith('enum('):
        vals = tp[5:-1].replace("'", '').split(',')
        return 'enum(' + ', '.join(vals[:3]) + (', …' if len(vals) > 3 else '') + ')'
    return tp


# ----------------------------------------------------------------- relationships between the core entities
RELS = []
for t in CORE:
    for f in T[t]['fks']:
        if f['ref'] in CORE:
            RELS.append(f)
N_CORE = len(CORE)
N_ASSOC = sum(1 for t in CORE if T[t]['pk'] and all(any(c in f['cols'] for f in T[t]['fks']) for c in T[t]['pk']) and len(T[t]['pk']) > 1)
if len(RELS) != len(C.LABELS):
    sys.exit(f'expected {len(C.LABELS)} relationships, found {len(RELS)}')


def rel_rows():
    rows = []
    for i, f in enumerate(sorted(RELS, key=lambda f: (CORE.index(f['ref']), CORE.index(f['table']))), 1):
        child, parent = f['table'], f['ref']
        name = C.LABELS[(child, f['cols'][0])]
        one_one = f['unique'] or (f['inPk'] and T[child]['pk'] == f['cols'])
        card = '1 : 1' if one_one else '1 : N'
        mn = '1' if not f['nullable'] else '0'
        parent_side = f'{"exactly one" if mn == "1" else "zero or one"} {SING[parent]}'
        child_side = 'at most one' if one_one else 'zero or many'
        self_ref = child == parent
        rows.append(
            f'<tr><td>{i}</td><td><b>{e(name)}</b></td><td>{e(ENTITY[parent][0])}</td><td>{e(ENTITY[child][0])}</td>'
            f'<td class="c">{card}{" (recursive)" if self_ref else ""}</td>'
            f'<td>Each {SING[child]} → {parent_side}; each {SING[parent]} → {child_side} {SING[child] if one_one else plural(SING[child])}</td>'
            f'<td>{"total" if mn == "1" else "partial"}</td>'
            f'<td><code>{e(child)}({e(", ".join(f["cols"]))})</code> → <code>{e(parent)}</code></td></tr>')
    return '\n'.join(rows)


# ----------------------------------------------------------------- relational notation
def rel_notation(t, with_types=False):
    fks = fk_of(t)
    parts = []
    for c in T[t]['columns']:
        n = c['name']
        s = e(n)
        if n in T[t]['pk']:
            s = f'<u>{s}</u>'
        if n in fks:
            s = f'<i>{s}</i><span class="ref">→{e(fks[n]["ref"])}</span>'
        if (t, n) in DERIVED:
            s = f'{s}<sup>d</sup>'
        parts.append(s)
    return f'<p class="rel"><b>{e(t.upper())}</b>({", ".join(parts)})</p>'


def keys_line(t):
    pk = ', '.join(T[t]['pk'])
    uks = '; '.join('(' + ', '.join(u['cols']) + ')' for u in ukeys(t)) or '—'
    return pk, uks


def entity_summary():
    rows = []
    for aid, label, fill, border, tables in C.AREAS:
        rows.append(f'<tr class="grp"><td colspan="5" style="background:{fill};border-left:4px solid {border}">{e(label)}</td></tr>')
        for t in tables:
            pk, uks = keys_line(t)
            fks = sorted({f['ref'] for f in T[t]['fks']})
            core_fks = [x for x in fks if x in CORE]
            rows.append(f'<tr><td><b>{e(t)}</b><br><span class="dim">{e(ENTITY[t][0])}</span></td><td>{e(ENTITY[t][1])}</td>'
                        f'<td><code>{e(pk)}</code></td><td><code>{e(uks)}</code></td><td class="c">{len(T[t]["columns"])}</td></tr>')
    return '\n'.join(rows)


def attribute_tables():
    out = []
    for t in CORE:
        fks = fk_of(t)
        uk = {}
        for i, u in enumerate(ukeys(t), 1):
            for c in u['cols']:
                uk.setdefault(c, []).append(f'UK{i}')
        rows = []
        for c in T[t]['columns']:
            n = c['name']
            key = (['PK'] if n in T[t]['pk'] else []) + (['FK'] if n in fks else []) + uk.get(n, [])
            note = []
            if n in fks:
                note.append(f'→ {fks[n]["ref"]}')
            if (t, n) in DERIVED:
                note.append('derived: ' + DERIVED[(t, n)])
            elif c.get('generated'):
                note.append('generated column')
            if c.get('autoInc'):
                note.append('auto-increment')
            rows.append(f'<tr><td>{" ".join(key)}</td><td><code>{e(n)}</code></td><td>{e(short(c["type"]))}</td>'
                        f'<td class="c">{"yes" if c["nullable"] else "no"}</td><td>{e("; ".join(note))}</td></tr>')
        out.append(f'<div class="attr"><h4>{e(t)} <span class="dim">— {e(ENTITY[t][0])}, {len(rows)} attributes</span></h4>'
                   f'<table class="t small"><tr><th style="width:11%">Key</th><th style="width:27%">Attribute</th><th style="width:22%">Type</th>'
                   f'<th style="width:7%">Null</th><th>Notes</th></tr>{"".join(rows)}</table></div>')
    return '\n'.join(out)


def other_tables():
    rows = []
    for t in CORE:
        for d in C.DETAILS[t]:
            pk = ', '.join(T[d]['pk']) if d in T else '—'
            fks = sorted({f['ref'] for f in T[d]['fks']}) if d in T else []
            rows.append(f'<tr><td><code>{e(d)}</code></td><td>{e(t)}</td><td><code>{e(pk)}</code></td><td>{e(", ".join(fks)) or "—"}</td></tr>')
    return '\n'.join(rows), sum(len(v) for v in C.DETAILS.values())


def svg(path):
    s = open(path, encoding='utf-8').read()
    return s[s.index('<svg'):]


CSS = '''
@page { size: A4; margin: 18mm 17mm 20mm 17mm; }
@page diagram { size: 420mm 297mm; margin: 8mm 8mm 14mm 8mm; }
@page big { size: 594mm 420mm; margin: 8mm 8mm 14mm 8mm; }
* { box-sizing: border-box; }
body { font-family: "Liberation Serif", "Times New Roman", serif; font-size: 10.6pt; line-height: 1.42; color: #1a1a1a; margin: 0; }
h1, h2, h3, h4, th, .t, .cover, .dim, code { font-family: "Liberation Sans", Arial, sans-serif; }
h1 { font-size: 19pt; margin: 0 0 4mm; }
h2 { font-size: 14pt; margin: 7mm 0 2.5mm; padding-bottom: 1.2mm; border-bottom: 1.2px solid #333; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; break-after: avoid; }
h4 { font-size: 10pt; margin: 4mm 0 1.2mm; break-after: avoid; }
p { margin: 0 0 2.2mm; text-align: justify; }
ul, ol { margin: 0 0 2.5mm; padding-left: 6mm; }
li { margin-bottom: 0.8mm; }
code { font-size: 8.6pt; background: #f3f3f3; padding: 0 2px; border-radius: 2px; }
table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 3.5mm; font-size: 8.4pt; line-height: 1.3; }
table.t th { background: #2f3b4c; color: #fff; text-align: left; padding: 1.4mm 1.6mm; font-weight: bold; }
table.t td { border-bottom: 0.6px solid #c9c9c9; padding: 1.1mm 1.6mm; vertical-align: top; }
table.t tr { break-inside: avoid; }
table.small { font-size: 7.9pt; }
table.small code { font-size: 7.6pt; }
td.c, th.c { text-align: center; }
tr.grp td { font-weight: bold; font-family: "Liberation Sans", Arial, sans-serif; font-size: 8.6pt; }
.dim { color: #666; font-size: 8pt; font-weight: normal; }
.note { border-left: 3px solid #b07a35; background: #fdf7ee; padding: 2mm 3mm; margin: 2mm 0 3mm; font-size: 9.6pt; break-inside: avoid; }
.ok { border-left-color: #4f8a5b; background: #f1f8f2; }
.rel { font-family: "Liberation Mono", monospace; font-size: 8.1pt; line-height: 1.45; margin: 0 0 2.4mm; text-align: left; break-inside: avoid; }
.rel b { font-family: "Liberation Sans", Arial, sans-serif; font-size: 8.8pt; }
.rel .ref { color: #7a4b12; font-size: 7.2pt; }
.rel sup { color: #b05454; font-size: 6.5pt; }
.attr { break-inside: avoid; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; }
.cover .top { margin-top: 30mm; }
.cover .k { font-size: 11pt; color: #555; letter-spacing: 0.06em; text-transform: uppercase; }
.cover h1 { font-size: 30pt; line-height: 1.12; margin: 6mm 0 4mm; }
.cover .sub { font-size: 14pt; color: #333; }
.cover table { font-size: 11pt; border-collapse: collapse; width: 120mm; }
.cover td { padding: 2.6mm 0; border-bottom: 0.6px solid #999; }
.cover td:first-child { width: 38mm; color: #555; }
.toc { font-family: "Liberation Sans", Arial, sans-serif; font-size: 10pt; }
.toc li { margin-bottom: 1.4mm; }
.diagram { page: diagram; break-before: page; break-after: page; width: 404mm; height: 272mm; display: flex; align-items: center; justify-content: center; }
.diagram > svg { width: 404mm; height: 270mm; }
.bigd { page: big; break-before: page; width: 578mm; height: 394mm; display: flex; align-items: center; justify-content: center; }
.bigd > svg { width: 578mm; height: 392mm; }
.pb { break-before: page; }
.ph { break-before: page; break-after: page; color: #fff; font-size: 4pt; }
.flat { font-size: 7.4pt; }
.flat td, .flat th { padding: 0.9mm 1.1mm; }
'''


def build_html():
    others, n_other = other_tables()
    n_cols = sum(len(T[t]['columns']) for t in CORE)
    n_tables = len(T)
    n_fk_total = sum(len(T[t]['fks']) for t in T)
    rel_count = len(RELS)
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>MUSE — Phase 1: ER Diagram and Normalisation</title>
<style>{CSS}</style></head><body>

<section class="cover">
 <div class="top">
  <div class="k">Database Management Systems · Project · Phase 1</div>
  <h1>MUSE — Music Mood Intelligence &amp; Recommendation Database System</h1>
  <div class="sub">ER Diagram and Normalisation Report</div>
 </div>
 <table>
  <tr><td>Submitted by</td><td>&#160;</td></tr>
  <tr><td>Roll number</td><td>&#160;</td></tr>
  <tr><td>Programme</td><td>B.Tech CSE</td></tr>
  <tr><td>Course</td><td>Database Management Systems</td></tr>
  <tr><td>Submitted to</td><td>&#160;</td></tr>
  <tr><td>Date</td><td>&#160;</td></tr>
 </table>
 <div class="dim">DBMS: MySQL 8.0 (InnoDB). All entities, attributes, keys and relationships in this report are taken
 from the project's executable schema (baseline + migrations 0001–0003).</div>
</section>

<section class="pb">
<h2 style="margin-top:0">Contents</h2>
<ol class="toc">
 <li>Project topic</li>
 <li>Entities</li>
 <li>Relationships and cardinalities</li>
 <li>ER diagram ({N_CORE} core entities) — crow's foot, Chen and textbook notation</li>
 <li>Normalisation: UNF → 1NF → 2NF → 3NF</li>
 <li>Final normalised schema</li>
 <li>Summary</li>
 <li>Appendix A — Attributes of each entity</li>
 <li>Appendix B — The remaining {n_other} tables of the database</li>
 <li>Appendix C — Complete ER diagram of all tables</li>
</ol>

<h2>1. Project topic</h2>
<p><b>MUSE</b> is a database system for a music streaming service that recommends songs by <b>mood</b>. It stores a music
catalogue (songs, artists, albums, genres), analyses each song's audio profile to tag it with moods, records what each user
listens to, learns each user's taste from that history, and generates ranked, explained recommendation lists. Users can also
build playlists.</p>
<p><b>Problem addressed.</b> A plain song list cannot answer questions such as "suggest calm songs I have not heard", "why was this
song recommended?" or "what is this user's favourite mood this week?". These need well-structured data about songs, moods, listening
behaviour and recommendations that stays consistent as it grows.</p>
<p><b>Objectives of the database.</b></p>
<ul>
 <li>Store the catalogue once, without duplication (each song, artist and album is one row).</li>
 <li>Link songs to many genres and many moods, with a confidence score for each mood.</li>
 <li>Let users rate how well each song fits each mood on a 0–100 % scale, kept apart from the AI's own mood prediction.</li>
 <li>Record every play inside a listening session, so taste can be learned from real behaviour.</li>
 <li>Store each recommendation list with the score of every song, so that recommendations can be explained later.</li>
 <li>Enforce integrity in the database itself: primary, unique and foreign keys, CHECK constraints and triggers.</li>
</ul>
<p><b>Scope of this report.</b> The full implementation has {n_tables} tables and {n_fk_total} foreign keys. For clarity this
report models the <b>{N_CORE} core entities</b> that carry the main business data, with <b>all</b> their {n_cols} attributes and the
{rel_count} relationships between them. Every other table supports one of these {N_CORE} (for example, <code>roles</code> supports
<code>users</code>); Appendix B lists them, and Appendix C shows the complete diagram.</p>

<h2>2. Entities</h2>
<p>The entities fall into six functional areas. An <b>associative entity</b> is one that exists to resolve a
many-to-many relationship and can carry attributes of its own (for example the confidence of a song's mood).</p>
<table class="t">
 <tr><th style="width:21%">Entity (table)</th><th>Meaning</th><th style="width:16%">Primary key</th><th style="width:22%">Other candidate keys (UNIQUE)</th><th class="c" style="width:7%">Attrs</th></tr>
 {entity_summary()}
</table>
<p>Kinds of attributes used: <b>key</b> attributes (PK/UK), <b>simple</b> attributes (e.g. <code>title</code>), <b>derived</b>
attributes whose value is computed from other data (e.g. <code>completion_pct</code>, marked <sup>d</sup> in Section 6), and
<b>multi-valued</b> facts (a song's genres and moods), which are not stored as columns but as rows of associative entities.
The full attribute list with data types is in Appendix A.</p>

<h2 class="pb">3. Relationships and cardinalities</h2>
<p>Each relationship below is implemented by a real foreign key. <b>Cardinality</b> is written parent : child.
<b>Participation</b> refers to the child (many) side: <i>total</i> means every child row must be linked
(the foreign key is NOT NULL); <i>partial</i> means the link is optional (nullable foreign key). On the parent side
participation is always partial: for example, an artist may exist before any of its songs are added.</p>
<table class="t small">
 <tr><th>#</th><th style="width:11%">Relationship</th><th style="width:12%">Parent (one)</th><th style="width:13%">Child (many)</th><th class="c" style="width:8%">Card.</th><th>Meaning</th><th style="width:7%">Child partic.</th><th style="width:22%">Foreign key</th></tr>
 {rel_rows()}
</table>

<h3>Many-to-many relationships and how they are resolved</h3>
<table class="t">
 <tr><th style="width:24%">Conceptual M : N</th><th style="width:22%">Associative entity</th><th>Attributes of the relationship itself</th></tr>
 <tr><td>Song M : N Genre</td><td><code>song_genres</code></td><td><code>is_primary</code> — at most one primary genre per song (unique key <code>primary_song_key</code>)</td></tr>
 <tr><td>Song M : N Mood <span class="dim">(per analysis model)</span></td><td><code>song_moods</code></td><td><code>confidence</code>, <code>feature_id</code>, <code>analyzed_at</code></td></tr>
 <tr><td>Recommendation batch M : N Song</td><td><code>recommendation_items</code></td><td><code>rank_position</code> and the nine scores (mood, audio, preference, recency, trend, context, regional, exploration, repetition penalty) and <code>final_score</code></td></tr>
 <tr><td>Playlist M : N Song</td><td><code>playlist_songs</code></td><td><code>position</code>, <code>added_at</code></td></tr>
 <tr><td>User M : N Song M : N Mood <span class="dim">(ternary: "rates how well")</span></td><td><code>song_mood_ratings</code></td><td><code>match_percentage</code> (0–100, two decimals), <code>review_text</code>, <code>created_at</code>, <code>updated_at</code> — one row per user, song and mood</td></tr>
 <tr><td>User M : N Song <span class="dim">(listens)</span></td><td><code>listening_history</code> (an entity with its own key <code>play_id</code>)</td><td><code>started_at</code>, <code>listened_sec</code>, <code>origin</code>, … — a user can play the same song many times, so each play is its own row</td></tr>
</table>
<div class="note ok"><b>Special cases.</b> <i>One-to-one:</i> <code>user_profiles.user_id</code> is both its primary key and a foreign key
to <code>users</code>, so a user has at most one profile. <i>Recursive (unary):</i> <code>genres.parent_genre_id → genres</code> (genre
hierarchy) and <code>songs.merged_into_song_id → songs</code> (a duplicate song points to the song it was merged into).
<i>Composite foreign key:</i> <code>listening_history(session_id, user_id) → listening_sessions(session_id, user_id)</code>, so a play can
only belong to a session of the same user.</div>

<section>
<h2>4. ER diagram ({N_CORE} core entities)</h2>
<p>The next page shows the ER diagram (A3 landscape, vector — zoom in for detail). It uses <b>crow's-foot notation</b>:</p>
<table class="t">
 <tr><th style="width:34%">Symbol at the end of a line</th><th>Meaning</th></tr>
 <tr><td>Two bars ‖</td><td>exactly one (mandatory)</td></tr>
 <tr><td>Bar and circle |○</td><td>zero or one (optional)</td></tr>
 <tr><td>Crow's foot with circle ○&lt;</td><td>zero or many</td></tr>
 <tr><td>Solid line</td><td>identifying relationship: the foreign key is part of the child's primary key (associative entities)</td></tr>
 <tr><td>Dashed line</td><td>non-identifying relationship</td></tr>
</table>
<p>Inside each entity box every attribute is listed with its data type. <b>PK</b> marks the primary key, <b>FK</b> a foreign key,
<b>UK/U1/U2</b> a unique (candidate) key, <i>null</i> an optional attribute and <i>gen</i> a generated (derived) column. A foreign key
written "→ table" points to one of the supporting tables of Appendix B. All {rel_count} relationships of Section 3 are drawn; the
diagram was generated from the live schema and checked automatically (every entity, every column and one line per foreign key).</p>
</section>

<div class="ph">@@PAGE_CORE@@</div>

<section>
<h2>4.1 The same model in Chen notation</h2>
<p>The next page draws the same core schema in <b>Chen notation</b>: rectangles are entities, ellipses attributes (key
attributes underlined), diamonds relationships, double ellipses multi-valued attributes and a double rectangle the weak entity.
Cardinalities are written on the lines (1, N, M, and P for the third side of the ternary relationship).</p>
<table class="t small">
 <tr><th style="width:34%">In the tables (Section 4)</th><th>In Chen notation (next page)</th></tr>
 <tr><td>Associative tables <code>song_genres</code>, <code>song_moods</code>, <code>recommendation_items</code>, <code>playlist_songs</code></td>
     <td>M : N relationships <i>belongs to</i>, <i>tagged with (AI)</i>, <i>recommends</i>, <i>includes</i>, with their own attributes
     (<code>is_primary</code>, <code>confidence</code>, <code>rank_position</code> / <code>final_score</code>, <code>position</code> / <code>added_at</code>)</td></tr>
 <tr><td><code>song_mood_ratings</code></td><td>the ternary relationship <i>rates mood fit</i> between USER, SONG and MOOD, with
     <code>match_percentage</code> and <code>review_text</code></td></tr>
 <tr><td><code>user_profiles</code> (its primary key is also the foreign key to <code>users</code>)</td>
     <td>weak entity USER PROFILE (double rectangle) with the identifying relationship <i>has</i> (double diamond); its key
     <code>user_id</code> comes from the owner (dashed underline) and its participation is total (double line)</td></tr>
 <tr><td><code>user_languages</code>, <code>artist_aliases</code>, <code>mood_keywords</code> (supporting tables, Appendix B)</td>
     <td>multi-valued attributes <i>languages</i>, <i>aliases</i>, <i>keywords</i> (double ellipses)</td></tr>
 <tr><td>Self-references <code>songs.merged_into_song_id</code>, <code>genres.parent_genre_id</code></td>
     <td>recursive relationships <i>merged into</i> and <i>sub-genre of</i> (two lines to the same entity)</td></tr>
</table>
<p>The Chen diagram is built from the same schema model and checked automatically: every attribute shown is a real column, and
its {len(CH.RELS)} relationships cover all {len(C.LABELS)} foreign keys between the core tables. Ellipses show the main attributes; every column is listed in Appendix A.</p>
</section>

<div class="ph">@@PAGE_CHEN@@</div>

<section>
<h2>4.2 The same model in textbook (Silberschatz–Korth–Sudarshan) notation</h2>
<p>The next page shows the model in the E-R notation of <i>Database System Concepts</i>. Each entity set is a box with all its
attributes inside (primary key underlined); foreign keys to other entity sets are not listed as attributes because they are the
relationship sets. An <b>arrow</b> points to the "one" side of a relationship, a <b>double line</b> marks total participation
(the foreign key is NOT NULL), a <b>double diamond</b> is the identifying relationship of the weak entity set
<code>user_profile</code>, <b>dashed lines</b> join relationship attributes (e.g. <code>match_percentage</code> of
<i>rates mood fit</i>), <code>{{ x }}</code> is a multivalued attribute and <code>x ( )</code> a derived one. The recursive relationships
carry role names (<i>canonical</i> / <i>duplicate</i>, <i>parent</i> / <i>sub-genre</i>).</p>
<table class="t small">
 <tr><th style="width:34%">Relationship</th><th>Mapping cardinality and participation</th></tr>
 <tr><td><i>performs</i>, <i>of song</i>, <i>contains plays</i>, <i>opens</i>, <i>receives</i>, <i>owns</i></td><td>many-to-one, total participation of the "many" side (double line)</td></tr>
 <tr><td><i>contains</i>, <i>came from</i>, <i>seeded by</i>, <i>saved from</i>, <i>merged into</i>, <i>sub-genre of</i></td><td>many-to-one, partial participation (the foreign key may be NULL)</td></tr>
 <tr><td><i>has</i></td><td>one-to-one identifying relationship; every <code>user_profile</code> belongs to exactly one <code>user</code></td></tr>
 <tr><td><i>belongs to</i>, <i>tagged with</i>, <i>recommends</i>, <i>includes</i>, <i>rates mood fit</i> (ternary)</td><td>many-to-many, partial participation, with relationship attributes</td></tr>
</table>
</section>

<div class="ph">@@PAGE_KORTH@@</div>

<h2>5. Normalisation</h2>
<p>Normalisation is shown by starting from one un-normalised "listening sheet", the way a naive system might store
plays, and decomposing it step by step. The sample rows are real rows from the project's demo data (user <i>aarav</i>).</p>

<h3>5.1 Un-normalised form (UNF)</h3>
<table class="t flat">
 <tr><th>user</th><th>email</th><th>region</th><th>languages</th><th>song</th><th>artist</th><th>artist country</th><th>album</th><th>genres</th><th style="width:17%">moods (confidence)</th><th>duration</th><th>played at</th><th>listened</th><th>rating</th></tr>
 <tr><td>aarav</td><td>aarav@muse.dev</td><td>IN-TG Telangana</td><td>te, hi</td><td>Raatbhar</td><td>DJ Tara</td><td>IN</td><td>Neon Mela</td><td>EDM, Electronic</td><td>Energetic 0.915, Motivational 0.815, Euphoric 0.777, Confident 0.731</td><td>232</td><td>10-10 18:41</td><td>232</td><td>4</td></tr>
 <tr><td>aarav</td><td>aarav@muse.dev</td><td>IN-TG Telangana</td><td>te, hi</td><td>Raatbhar</td><td>DJ Tara</td><td>IN</td><td>Neon Mela</td><td>EDM, Electronic</td><td>Energetic 0.915, Motivational 0.815, Euphoric 0.777, Confident 0.731</td><td>232</td><td>10-10 18:44</td><td>232</td><td>4</td></tr>
 <tr><td>aarav</td><td>aarav@muse.dev</td><td>IN-TG Telangana</td><td>te, hi</td><td>Ganpati Dhol</td><td>Sahyadri Strings</td><td>IN</td><td>Sahyadri Sunrise</td><td>Folk</td><td>Euphoric 0.863, Happy 0.854, Motivational 0.801, Energetic 0.686</td><td>230</td><td>10-11 17:02</td><td>230</td><td>5</td></tr>
</table>
<p><b>Problems.</b> (1) <i>Repeating groups / non-atomic values:</i> <code>languages</code>, <code>genres</code> and <code>moods</code> hold
lists. (2) <i>Update anomaly:</i> the song facts of "Raatbhar" are repeated on every play; correcting its album means changing many rows.
(3) <i>Insertion anomaly:</i> a new song cannot be stored until someone plays it. (4) <i>Deletion anomaly:</i> deleting the only play of
"Ganpati Dhol" in this sheet also deletes everything known about the song and its artist.</p>

<h3>5.2 Functional dependencies</h3>
<p>The main functional dependencies (FDs) in this data are:</p>
<ul>
 <li><code>user → email, region, display_name, …</code></li>
 <li><code>region → region_name, country</code></li>
 <li><code>song → title, duration, release_year, isrc, album, artist, …</code></li>
 <li><code>artist → artist_name, artist_type, country_code, …</code></li>
 <li><code>album → album_title, album_type, film, release_year, …</code></li>
 <li><code>(song, mood, model) → confidence</code>; &#160;<code>(song, genre) → is_primary</code></li>
 <li><code>(user, song) → rating</code> &#160;(a user rates a song once; the rating does not depend on a particular play)</li>
 <li><code>(user, song, played_at) → listened, session, device, …</code> &#160;(facts of one play)</li>
</ul>

<h3>5.3 First normal form (1NF)</h3>
<p><b>Rule:</b> every attribute holds a single atomic value and there are no repeating groups. Each multi-valued attribute is
moved to its own relation, keyed by the owner plus the value:</p>
<ul>
 <li><code>PLAY_1NF(<u>user, song, played_at</u>, email, region, region_name, title, artist, artist_country, album, duration, listened, rating)</code></li>
 <li><code>USER_LANGUAGE(<u>user, language</u>, priority)</code></li>
 <li><code>SONG_GENRE(<u>song, genre</u>, is_primary)</code></li>
 <li><code>SONG_MOOD(<u>song, mood, model</u>, confidence)</code> &#160;<span class="dim">(model = the analysis model version that produced the confidence)</span></li>
</ul>
<p>Every cell now holds one value. The relation is in 1NF but still has the update, insertion and deletion anomalies, because user and
song facts are repeated on every play.</p>

<h3>5.4 Second normal form (2NF)</h3>
<p><b>Rule:</b> 1NF, and no non-key attribute depends on only <i>part</i> of a composite candidate key (no partial dependency).
The key of <code>PLAY_1NF</code> is <code>(user, song, played_at)</code>. The partial dependencies are:</p>
<table class="t">
 <tr><th style="width:42%">Partial dependency</th><th>Decomposition</th></tr>
 <tr><td><code>user → email, region, region_name</code></td><td><code>USER(<u>user</u>, email, region, region_name)</code></td></tr>
 <tr><td><code>song → title, artist, artist_country, album, duration</code></td><td><code>SONG(<u>song</u>, title, artist, artist_country, album, duration)</code></td></tr>
 <tr><td><code>(user, song) → rating</code></td><td><code>RATING(<u>user, song</u>, rating)</code></td></tr>
 <tr><td>remaining: <code>(user, song, played_at) → listened</code></td><td><code>PLAY(<u>user, song, played_at</u>, listened)</code></td></tr>
</table>
<p>In the three associative relations of 1NF the non-key attributes depend on the <i>whole</i> key
(<code>is_primary</code> on (song, genre), <code>confidence</code> on (song, mood, model), <code>priority</code> on (user, language)), so they
are already in 2NF. All four anomalies of 5.1 are now removed: a song can exist without plays, and song facts are stored once.</p>

<h3>5.5 Third normal form (3NF)</h3>
<p><b>Rule:</b> 2NF, and no non-key attribute depends on another non-key attribute (no transitive dependency
<code>key → X → Y</code>). The transitive dependencies left after 2NF and their decomposition:</p>
<table class="t">
 <tr><th style="width:42%">Transitive dependency</th><th>Decomposition (final tables)</th></tr>
 <tr><td><code>user → region → region_name, country</code></td><td><code>regions(<u>region_code</u>, name, country_code, …)</code>; the profile keeps only <code>region_code</code></td></tr>
 <tr><td><code>song → artist → artist_name, artist_country</code></td><td><code>artists(<u>artist_id</u>, name, country_code, …)</code>; songs keep <code>primary_artist_id</code></td></tr>
 <tr><td><code>song → album → album_title, album_type, film</code></td><td><code>albums(<u>album_id</u>, …)</code> and <code>films(<u>film_id</u>, …)</code>; songs keep <code>album_id</code></td></tr>
 <tr><td><code>play → session → device, context, started_at</code></td><td><code>listening_sessions(<u>session_id</u>, user_id, device, context_id, …)</code>; each play keeps <code>session_id</code></td></tr>
 <tr><td><code>mood → category → category_name</code></td><td><code>mood_categories(<u>category_id</u>, …)</code>; moods keep <code>category_id</code></td></tr>
 <tr><td><code>user → (login data) / (profile data)</code></td><td>split 1:1 into <code>users</code> (credentials) and <code>user_profiles</code> (display data), both keyed by <code>user_id</code></td></tr>
</table>
<p>Surrogate keys (<code>user_id</code>, <code>song_id</code>, <code>play_id</code>, …) replace the natural keys of the derivation. The natural
identities stay enforced as unique keys, for example <code>users.username</code>, <code>users.email</code>, <code>songs.isrc</code> and
<code>songs(primary_artist_id, normalized_title, version_label)</code>.</p>

<h3>5.6 Check of the final core tables</h3>
<table class="t small">
 <tr><th style="width:21%">Table</th><th style="width:22%">Key</th><th class="c" style="width:7%">2NF</th><th class="c" style="width:7%">3NF</th><th>Reason</th></tr>
 {check_rows()}
</table>

<h3>5.7 Deliberate exceptions (controlled redundancy)</h3>
<p>A few attributes are kept although they can be derived, because they are read very often. Each is either computed by MySQL
itself or kept consistent by a constraint, trigger or procedure, so it cannot silently disagree with its source:</p>
<table class="t small">
 <tr><th style="width:26%">Attribute(s)</th><th style="width:30%">Dependency</th><th>How consistency is guaranteed</th></tr>
 <tr><td><code>listening_history.user_id</code></td><td><code>play → session_id → user_id</code> (transitive)</td><td>Composite foreign key <code>(session_id, user_id) → listening_sessions(session_id, user_id)</code>: a mismatching user is rejected by the database.</td></tr>
 <tr><td><code>listening_history.completion_pct, completed, skipped, is_replay</code></td><td>derived from <code>listened_sec</code> and the song's duration</td><td>Set by triggers <code>trg_lh_bi</code> / <code>trg_lh_bu</code>; values sent by the application are overwritten.</td></tr>
 <tr><td><code>playlists.song_count, total_duration_sec</code>; <code>listening_sessions.plays, listen_sec</code></td><td>aggregates of child rows</td><td>Playlists: triggers <code>trg_ps_ai</code> / <code>trg_ps_ad</code> on <code>playlist_songs</code>. Sessions: incremented in the same transaction as each play and recomputed exactly by <code>sp_close_listening_session</code>.</td></tr>
 <tr><td><code>songs.normalized_title</code>, <code>artists.normalized_name</code>, <code>albums.normalized_title</code>, <code>song_genres.primary_song_key</code></td><td>functions of other columns of the same row</td><td>Generated columns: MySQL computes them, so they can never drift.</td></tr>
</table>

<div class="note"><b>Two known deviations, stated honestly.</b><br>
(1) <code>artists.country_code</code>: when an artist has a <code>region_code</code>, the country is also implied by
<code>regions.country_code</code> (<code>artist → region_code → country_code</code>). The column is needed for artists without a region
(6 of the 31 artists in the seeded demo data, <code>07_seed.sql</code>), but no constraint currently checks that it matches the region. A strict 3NF fix is to add a unique key
<code>regions(region_code, country_code)</code> and a composite foreign key <code>artists(region_code, country_code)</code> to it.
In the seeded demo data every artist that has a region carries the matching country.<br>
(2) <code>song_moods.feature_id</code> records which audio-analysis row a mood was computed from. Within one analysis run it is the same
for every mood of a song, i.e. <code>(song_id, model_id) → feature_id</code>, a dependency on part of the key. It is written only by the
procedure <code>sp_analyze_song_moods</code>, which inserts all rows of a run from one feature row, so the values stay consistent; a strict
2NF design would move it to a relation keyed by <code>(song_id, model_id)</code>.<br>
Therefore the accurate statement is: <b>the schema is in 3NF except for these documented, controlled cases.</b></div>

<h3>5.8 New relation: mood-wise percentage ratings</h3>
<p><b>Requirement.</b> Users rate how well a song fits each mood on a 0–100 scale (for example Happy 92.50 %, Sad 18.00 %), may change
their rating later, and must not rate the same song and mood twice. Averages and rating counts per song and mood are needed for
mood-based recommendations. These ratings are user opinion, which is a different fact from the AI's prediction in <code>song_moods.confidence</code>.</p>
<p><b>Un-normalised idea.</b> Storing the ratings as columns of <code>songs</code> (<code>happy_pct</code>, <code>sad_pct</code>, …) or as a list
in one cell breaks 1NF, cannot hold one value <i>per user</i>, and needs a schema change for every new mood. Adding the user's ratings to
<code>song_moods</code> would mix two facts with different keys: (song, mood, model) → AI confidence and (user, song, mood) → user rating.</p>
<p><b>Functional dependencies.</b> <code>(user_id, song_id, mood_id) → match_percentage, review_text, created_at, updated_at</code>.
No attribute depends on a proper subset of the key: the same user gives different values to different moods of one song, different
users give different values to the same song and mood, and one user rates the same mood differently for different songs.
No non-key attribute determines another.</p>
<p><b>Result.</b> <code>SONG_MOOD_RATINGS(<u>user_id, song_id, mood_id</u>, match_percentage, review_text, created_at, updated_at)</code>
is in 1NF (atomic values), 2NF (no partial dependency) and 3NF (no transitive dependency); its only determinant is the key, so it is
also in BCNF. The average and count per song and mood are <b>not stored</b>; they are computed by the view
<code>v_song_mood_rating_stats</code> (GROUP BY song_id, mood_id), so they can never disagree with the ratings.</p>
<table class="t small">
 <tr><th style="width:30%">Rule</th><th>How the database enforces it</th></tr>
 <tr><td>One rating per user, song and mood</td><td>Composite primary key <code>(user_id, song_id, mood_id)</code>; a second insert fails (error 1062).</td></tr>
 <tr><td>0 ≤ rating ≤ 100, two decimals</td><td><code>DECIMAL(5,2)</code> and <code>CHECK (match_percentage BETWEEN 0 AND 100)</code>.</td></tr>
 <tr><td>Valid user, song and mood</td><td>Foreign keys to <code>users</code>, <code>songs</code>, <code>moods</code> with the same column types (INT UNSIGNED, INT UNSIGNED, SMALLINT UNSIGNED); ON DELETE CASCADE.</td></tr>
 <tr><td>AI prediction is never overwritten</td><td>Stored in a different table; no trigger or procedure writes user ratings into <code>song_moods</code>.</td></tr>
</table>

<h2>6. Final normalised schema</h2>
<p>Relational notation for the {N_CORE} core relations, with <b>every</b> attribute: <u>underlined</u> = primary key,
<i>italic</i>→table = foreign key, <sup>d</sup> = derived attribute (Section 5.7). Unique keys are listed in Section 2 and Appendix A.</p>
{"".join(rel_notation(t) for t in CORE)}
<p>Together with the supporting relations of Appendix B (for example <code>RATINGS(<u>user_id, song_id</u>, rating, …)</code>,
<code>REGIONS(<u>region_code</u>, …)</code>, <code>FILMS(<u>film_id</u>, …)</code>, <code>MOOD_CATEGORIES(<u>category_id</u>, …)</code>,
<code>USER_LANGUAGES(<u>user_id, language_id</u>, priority)</code>) these form the normalised schema implemented in MySQL.</p>

<div style="break-inside: avoid"><h2>7. Summary</h2>
<table class="t">
 <tr><th style="width:45%">Item</th><th>Result</th></tr>
 <tr><td>Topic</td><td>MUSE — mood-based music recommendation database</td></tr>
 <tr><td>Entities in the ER diagram</td><td>{N_CORE} core entities ({N_ASSOC} associative), {n_cols} attributes</td></tr>
 <tr><td>Relationships</td><td>{rel_count}: 1 one-to-one and {rel_count - 1} one-to-many (2 of them recursive); 6 conceptual many-to-many relationships (one of them ternary) resolved by associative entities</td></tr>
 <tr><td>Normal form reached</td><td>3NF, with the controlled redundancy and the two documented deviations of Section 5.7</td></tr>
 <tr><td>Complete implementation</td><td>{n_tables} tables, {n_fk_total} foreign keys (Appendix B and C)</td></tr>
</table></div>

<h2 class="pb">Appendix A — Attributes of each entity</h2>
<p>Generated from the database catalogue (<code>information_schema</code>). UK1, UK2… mark the columns of each unique key.</p>
{attribute_tables()}

<h2 class="pb">Appendix B — The remaining {n_other} tables of the database</h2>
<p>The database has {n_tables} tables. The table below assigns each one that is not drawn in the {N_CORE}-entity diagram to the core
entity it supports. <code>schema_migrations</code> only records which schema versions were applied.</p>
<table class="t small">
 <tr><th style="width:30%">Table</th><th style="width:22%">Supports</th><th style="width:22%">Primary key</th><th>References</th></tr>
 {others}
</table>

<section>
<h2 class="pb">Appendix C — Complete ER diagram of all tables</h2>
<p>The next page shows every table of the implementation with all {n_fk_total} foreign keys, grouped in eight functional areas, in
the same notation as Section 4. It is printed on an A1 page and is fully vector, so it can be zoomed. The same diagram, plus one page
per functional area at full size, is provided separately as <code>MUSE_ERD_Full_Schema.pdf</code>.</p>
</section>
<div class="ph">@@PAGE_FULL@@</div>
</body></html>'''


def check_rows():
    reasons = {
        'users': 'All attributes describe the account; username and email are candidate keys.',
        'user_profiles': 'Key is user_id (1:1 with users); region name is in regions.',
        'artists': 'Region and language details are in their own tables. See note on country_code (5.7).',
        'albums': 'Film and language details are in films / languages.',
        'songs': 'Artist and album details are in their own tables; only their keys are stored.',
        'genres': 'Single-attribute key; parent genre is a key reference.',
        'song_genres': 'is_primary depends on the whole key (song, genre).',
        'moods': 'Category details are in mood_categories.',
        'song_moods': 'confidence depends on the whole key. See note on feature_id (5.7).',
        'listening_sessions': 'Context details are in contexts; plays / listen_sec are controlled aggregates.',
        'listening_history': 'Song and session facts are not repeated; user_id and outcome flags are controlled (5.7).',
        'recommendation_batches': 'Targets describe the request itself (copied at request time, not a dependency on a mood).',
        'recommendation_items': 'Every score depends on the whole key (batch, song).',
        'playlists': 'song_count / total_duration_sec are trigger-maintained aggregates (5.7).',
        'playlist_songs': 'position and added_at depend on the whole key (playlist, song).',
        'song_mood_ratings': 'match_percentage and review_text depend on the whole key (user, song, mood); see 5.8.',
    }
    flags = {'artists': ('yes', 'yes*'), 'song_moods': ('yes*', 'yes*'), 'listening_history': ('yes', 'yes*'),
             'listening_sessions': ('yes', 'yes*'), 'playlists': ('yes', 'yes*')}
    rows = []
    for t in CORE:
        two, three = flags.get(t, ('yes', 'yes'))
        rows.append(f'<tr><td><code>{e(t)}</code></td><td><code>{e(", ".join(T[t]["pk"]))}</code></td><td class="c">{two}</td>'
                    f'<td class="c">{three}</td><td>{e(reasons[t])}</td></tr>')
    rows.append('<tr><td colspan="5" class="dim">* with the controlled exception explained in 5.7</td></tr>')
    return '\n'.join(rows)


def main():
    check_derived()
    os.makedirs(OUT_DIR, exist_ok=True)
    src = build_html()
    tmp = os.path.join(OUT_DIR, '.report.html')
    open(tmp, 'w', encoding='utf-8').write(src)
    footer = ('<div style="font-family:Liberation Sans,Arial;font-size:7.5px;color:#777;width:100%;padding:0 12mm;display:flex;'
              'justify-content:space-between"><span>MUSE — Phase 1: ER Diagram and Normalisation</span>'
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
    # swap the placeholder pages for the generated vector diagram pages (A3 core, A1 full schema)
    from pypdf import PdfWriter
    inserts = {'@@PAGE_CORE@@': (os.path.join(ERD, 'MUSE_ERD_Core.pdf'), 0),
               '@@PAGE_CHEN@@': (os.path.join(ERD, 'MUSE_ERD_Chen.pdf'), 0),
               '@@PAGE_KORTH@@': (os.path.join(ERD, 'MUSE_ERD_Korth.pdf'), 0),
               '@@PAGE_FULL@@': (os.path.join(ERD, 'MUSE_ERD_Full_Schema.pdf'), 0)}
    src_pdf = PdfReader(OUT)
    w = PdfWriter()
    found = set()
    for pgobj in src_pdf.pages:
        txt = pgobj.extract_text() or ''
        hit = [k for k in inserts if k in txt]
        if hit:
            f, i = inserts[hit[0]]
            w.add_page(PdfReader(f).pages[i])
            found.add(hit[0])
        else:
            w.add_page(pgobj)
    if found != set(inserts):
        sys.exit(f'placeholders not found: {set(inserts) - found}')
    w.add_metadata({'/Title': 'MUSE — Phase 1: ER Diagram and Normalisation Report', '/Subject': 'DBMS project, Phase 1'})
    with open(OUT, 'wb') as fh:
        w.write(fh)
    r = PdfReader(OUT)
    sizes = [(round(float(x.mediabox.width) / 72 * 25.4), round(float(x.mediabox.height) / 72 * 25.4)) for x in r.pages]
    text = ' '.join(x.extract_text() or '' for x in r.pages)
    missing = [t for t in T if t not in text]
    print(f'{OUT}: {len(r.pages)} pages, sizes {sorted(set(sizes))}')
    print(f'tables not found as text: {missing}')
    if missing:
        sys.exit(1)


if __name__ == '__main__':
    main()
