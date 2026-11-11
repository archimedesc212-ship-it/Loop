#!/usr/bin/env python3
"""
Diagram D — "core entities" ER diagram: a simplified submission diagram with the
core of MUSE's real tables, every column of each, and only real foreign keys between
them. The database itself is NOT changed: every other table still exists, and
each one is mapped to the core entity whose details it holds
(docs/erd/core-mapping.json, checked here: every table appears exactly once).

  python3 backend/scripts/erd/build_core.py     (after extract-schema.js)

Outputs in docs/erd/: MUSE_ERD_Core.svg / .png / .pdf (A3 landscape),
MUSE_ERD_Core.mmd, MUSE_ERD_Core.drawio, core-mapping.json
"""
import json
import os
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(__file__))
import build_erd as B  # noqa: E402  (loads the schema model and helpers; builds nothing on import)
from compose import Block, compose, render_svg  # noqa: E402

T, FKS, OUT, BUILD, FONT = B.T, B.FKS, B.OUT, B.BUILD, B.FONT

# ---------------------------------------------------------------- the core entities, in 6 areas
AREAS = [
    ('u', 'Users', '#EEF3FB', '#5B7DB1', ['users', 'user_profiles']),
    ('c', 'Music Catalogue', '#EEF7EF', '#4F8A5B', ['artists', 'albums', 'songs', 'genres', 'song_genres']),
    ('m', 'Mood Intelligence', '#F6F0FA', '#7D5BA6', ['moods', 'song_moods', 'song_mood_ratings']),
    ('l', 'Listening History', '#FDF4EA', '#B07A35', ['listening_sessions', 'listening_history']),
    ('r', 'Recommendations', '#FCEEEE', '#B05454', ['recommendation_batches', 'recommendation_items']),
    ('p', 'Playlists', '#EAF6F6', '#3E8A8A', ['playlists', 'playlist_songs']),
]
CORE = [t for a in AREAS for t in a[4]]
AREA_OF = {t: a for a in AREAS for t in a[4]}
GRID = [['u', 'c', 'm'], ['l', 'r', 'p']]

# ---------------------------------------------------------------- where the other tables' content lives
DETAILS = {
    'users': ['roles', 'permissions', 'role_permissions', 'auth_sessions', 'user_languages', 'audit_logs'],
    'user_profiles': ['regions', 'languages'],
    'artists': ['artist_aliases', 'user_artist_preferences'],
    'albums': ['album_artists', 'films'],
    'songs': ['song_artists', 'song_media', 'music_sources', 'source_records', 'pipeline_jobs', 'pipeline_job_logs', 'review_queue', 'trend_snapshots'],
    'genres': ['user_genre_preferences'],
    'song_genres': [],
    'moods': ['mood_categories', 'mood_keywords', 'contexts', 'context_keywords', 'context_moods', 'user_mood_preferences', 'user_context_preferences'],
    'song_moods': ['audio_features', 'mood_segments', 'song_mood_curations', 'intelligence_models', 'model_parameters'],
    'song_mood_ratings': [],
    'listening_sessions': ['incognito_sessions', 'incognito_events', 'search_history'],
    'listening_history': ['playback_events', 'ratings', 'user_likes', 'song_dismissals'],
    'recommendation_batches': ['recommendation_batch_moods', 'weekly_worlds', 'world_archetypes', 'archetype_moods', 'world_feedback'],
    'recommendation_items': ['recommendation_reasons', 'reason_types'],
    'playlists': [],
    'playlist_songs': [],
}
# schema_migrations is bookkeeping (which migration files have run), not data; it is listed
# under users only so that every table is accounted for
DETAILS['users'].append('schema_migrations')

# readable relationship names (child FK → parent)
LABELS = {
    ('user_profiles', 'user_id'): 'has profile (1:1)', ('songs', 'primary_artist_id'): 'performs',
    ('songs', 'album_id'): 'contains', ('songs', 'merged_into_song_id'): 'merged into',
    ('genres', 'parent_genre_id'): 'sub-genre of', ('song_genres', 'song_id'): 'classified as',
    ('song_genres', 'genre_id'): 'genre of', ('song_moods', 'song_id'): 'tagged with', ('song_moods', 'mood_id'): 'mood of',
    ('listening_sessions', 'user_id'): 'opens', ('listening_history', 'session_id'): 'contains plays',
    ('listening_history', 'song_id'): 'played', ('listening_history', 'batch_id'): 'came from list',
    ('playlists', 'user_id'): 'owns', ('playlists', 'source_batch_id'): 'saved from list',
    ('playlist_songs', 'playlist_id'): 'includes', ('playlist_songs', 'song_id'): 'listed in',
    ('recommendation_batches', 'user_id'): 'receives', ('recommendation_batches', 'seed_song_id'): 'seeded by',
    ('recommendation_items', 'batch_id'): 'ranks', ('recommendation_items', 'song_id'): 'recommends',
    # 0004: users' 0–100 mood-match ratings (separate from the AI's song_moods)
    ('song_mood_ratings', 'user_id'): 'rates mood fit', ('song_mood_ratings', 'song_id'): 'mood-rated as',
    ('song_mood_ratings', 'mood_id'): 'rated mood',
}


def check_mapping():
    seen = {}
    for core, extra in DETAILS.items():
        for t in [core] + extra:
            if t in seen:
                sys.exit(f'{t} mapped twice ({seen[t]}, {core})')
            seen[t] = core
    missing = sorted(set(T) - set(seen))
    unknown = sorted(set(seen) - set(T))
    if missing or unknown or len(CORE) != len(DETAILS):
        sys.exit(f'mapping incomplete: missing {missing}, unknown {unknown}')
    return seen


def node(name):
    """Every column of the table; FK columns that point outside the core say where they point."""
    a = AREA_OF[name]
    tb = T[name]
    fk_of = {c: f for f in tb['fks'] for c in f['cols']}
    uk = {}
    for i, u in enumerate(tb['uniques'], 1):
        for c in u['cols']:
            uk.setdefault(c, []).append('UK' if len(tb['uniques']) == 1 else f'U{i}')
    out = [f'<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2" COLOR="{a[3]}" BGCOLOR="#FFFFFF">',
           f'<TR><TD COLSPAN="3" BGCOLOR="{a[2]}" CELLPADDING="6"><FONT POINT-SIZE="14"><B>{name}</B></FONT></TD></TR>']
    for c in tb['columns']:
        n = c['name']
        tags = (['PK'] if n in tb['pk'] else []) + (['FK'] if n in fk_of else []) + uk.get(n, [])
        typ = B.short_type(c['type']) + (' · null' if c['nullable'] else '')
        if c['generated']:
            typ += ' · gen'
        if n in fk_of and fk_of[n]['ref'] not in CORE:
            typ += f' → {fk_of[n]["ref"]}'
        label = f'<B>{n}</B>' if n in tb['pk'] else n
        out.append(f'<TR><TD ALIGN="LEFT" PORT="L_{n}"><FONT POINT-SIZE="9" COLOR="#555555">{" ".join(tags) or "&#160;"}</FONT></TD>'
                   f'<TD ALIGN="LEFT"><FONT POINT-SIZE="11">{label}</FONT></TD>'
                   f'<TD ALIGN="LEFT" PORT="R_{n}"><FONT POINT-SIZE="9" COLOR="#777777">{escape(typ)}</FONT></TD></TR>')
    out.append('</TABLE>')
    return f'{B.q(name)} [shape=plaintext, label=<{"".join(out)}>];'


def main():
    mapping = check_mapping()
    core = set(CORE)
    rels = [f for f in FKS if f['table'] in core and f['ref'] in core]
    rel_keys = {(f['table'], f['cols'][0]) for f in rels}
    if set(LABELS) != rel_keys:
        sys.exit(f'label table out of sync with the real foreign keys: extra {set(LABELS) - rel_keys}, missing {rel_keys - set(LABELS)}')

    blocks = {}
    for aid, label, fill, border, tables in AREAS:
        inside = set(tables)
        intra = [(f, LABELS[(f['table'], f['cols'][0])]) for f in rels if f['table'] in inside and f['ref'] in inside]
        group = (aid, label, fill, border, tables)
        src = B.block_dot(group, tables, [node(t) for t in tables], intra, {'rankdir': 'LR'}, wrap=3, compact=True)
        # self-references (songs.merged_into_song_id, genres.parent_genre_id): leave and enter on
        # the right-hand side so Graphviz draws a small loop beside the table, not one around it
        if any(f['table'] == f['ref'] for f, _ in intra):
            src = src.replace('ranksep=0.45', 'ranksep=1.1')   # room for the self-loop labels
        for f, _ in intra:
            if f['table'] == f['ref']:
                t = B.q(f['table'])
                src = src.replace(f'{t}:"R_{f["cols"][0]}" -> {t}:"L_{f["refCols"][0]}"',
                                  f'{t}:"R_{f["cols"][0]}":e -> {t}:"R_{f["refCols"][0]}":e')
        # self-loop labels as xlabels: Graphviz then keeps them clear of neighbouring tables
        src = '\n'.join(l.replace(', label=<', ', xlabel=<') if ':e -> ' in l else l for l in src.split('\n'))
        src = src.replace('newrank=true]', 'newrank=true, forcelabels=true]', 1)
        blocks[aid] = Block(render_svg(src, os.path.join(BUILD, f'_core_{aid}.svg')))
    inter = []
    for f in rels:
        if AREA_OF[f['table']] is AREA_OF[f['ref']]:
            continue
        parent, child = B.ends(f)
        inter.append({'child': f['table'], 'child_col': f['cols'][0], 'parent': f['ref'], 'parent_col': f['refCols'][0],
                      'tail': child, 'head': parent, 'dashed': not f['inPk'], 'label': LABELS[(f['table'], f['cols'][0])]})
    legend = B.legend_block(os.path.join(BUILD, '_core_legend.svg'))
    grid = [[blocks[c] for c in row] for row in GRID] + [[None, legend, None]]
    n, total = len(CORE), len(T)
    w, h = compose(grid, inter, f'MUSE — ER Diagram ({n} core entities)',
                   f'{n} of the {total} tables, with ALL their columns and the {len(rels)} real foreign keys between them. '
                   '"→ table" marks a foreign key to a table not drawn here.\n'
                   f'Simplified view for submission: the database is unchanged; each of the other {total - n} tables belongs to one of these {n} '
                   '(see MUSE_ERD_Core_GUIDE.md). Complete schema: MUSE_ERD_Full_Schema.',
                   os.path.join(OUT, 'MUSE_ERD_Core.svg'), gap=55, margin=28, label_size=12)

    # ---- Mermaid (core entities, all columns)
    lines = [f'%% MUSE — ER diagram, {n} core entities (simplified view of the {total}-table schema)', f'%% {B.GEN}', 'erDiagram']
    for t in CORE:
        tb = T[t]
        fkc = {c for f in tb['fks'] for c in f['cols']}
        ukc = {c for u in tb['uniques'] for c in u['cols']}
        lines.append(f'  {t} {{')
        for c in tb['columns']:
            keys = [k for k, ok in (('PK', c['name'] in tb['pk']), ('FK', c['name'] in fkc), ('UK', c['name'] in ukc)) if ok]
            typ = B.short_type(c['type']).replace(',', '_').replace(' ', '_')
            note = ', '.join(x for x, ok in (('nullable', c['nullable']), ('generated', c['generated'])) if ok)
            lines.append(f'    {typ} {c["name"]}{" " + ", ".join(keys) if keys else ""}{" " + json.dumps(note) if note else ""}')
        lines.append('  }')
    for f in rels:
        lines.append(f'  {f["ref"]} {B.mermaid_card(f)} {f["table"]} : "{LABELS[(f["table"], f["cols"][0])]}"')
    open(os.path.join(OUT, 'MUSE_ERD_Core.mmd'), 'w').write('\n'.join(lines) + '\n')

    # ---- draw.io
    nodes, clusters = [], []
    for row in grid:
        for b in row:
            if not b or not any(t in core for t in b.nodes):
                continue
            ts = [t for t in b.nodes if t in core]
            a = AREA_OF[ts[0]]
            clusters.append((a[1], a[2], a[3], b.x, b.y, b.w, b.h))
            nodes += [(t, b.x + b.nodes[t]['x0'], b.y + b.nodes[t]['y0'], b.nodes[t]['x1'] - b.nodes[t]['x0'],
                       b.nodes[t]['y1'] - b.nodes[t]['y0']) for t in ts]
    edges = []
    for f in rels:
        parent, child = B.ends(f)
        edges.append((f['table'], f['ref'], child, parent, not f['inPk'], LABELS[(f['table'], f['cols'][0])]))
    xml, nn, ne = B.drawio_cells(nodes, clusters, edges, f'D · Core {n} entities', 'core')
    open(os.path.join(OUT, 'MUSE_ERD_Core.drawio'), 'w').write(f'<mxfile host="app.diagrams.net" type="device" version="24.0.0">{xml}</mxfile>')

    # ---- mapping + validation
    out_rels = sorted(f'{f["table"]}({", ".join(f["cols"])}) -> {f["ref"]}' for f in FKS if f['table'] in core and f['ref'] not in core)
    rep = {
        'coreEntities': CORE, 'count': len(CORE), 'columnsShown': sum(len(T[t]['columns']) for t in CORE),
        'relationshipsBetweenCore': len(rels), 'relationships': sorted(f'{f["table"]}({", ".join(f["cols"])}) -> {f["ref"]}' for f in rels),
        'foreignKeysToTablesNotDrawn': out_rels,
        'detailsMapping': {k: v for k, v in DETAILS.items()}, 'everyTableMappedOnce': len(mapping) == len(T),
        'drawio': {'entities': nn, 'edges': ne}, 'size': [round(w), round(h)],
    }
    json.dump(rep, open(os.path.join(OUT, 'core-mapping.json'), 'w'), indent=1)
    print(f'core: {len(CORE)} entities, {rep["columnsShown"]} columns, {len(rels)} relationships, '
          f'{len(out_rels)} FKs to tables not drawn, every table mapped once: {rep["everyTableMappedOnce"]}, size {rep["size"]}')

    render(len(rels))


def render(n_rels):
    import re
    from playwright.sync_api import sync_playwright
    from render import CHECK_JS, PAGE, svg_text, A3
    svg_path = os.path.join(OUT, 'MUSE_ERD_Core.svg')
    raw = open(svg_path, encoding='utf-8').read()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto('file://' + svg_path)
        r = pg.evaluate(CHECK_JS)
        names = set(r['allText'])
        missing = [t for t in CORE if t not in names]
        cols_missing = [f'{t}.{c["name"]}' for t in CORE for c in T[t]['columns'] if c['name'] not in names]
        pg.close()
        pg = b.new_page(device_scale_factor=2)
        pg.set_content('<html><body style="margin:0;background:#fff">' + svg_text(svg_path) + '</body></html>')
        dims = pg.evaluate("() => { const r = document.querySelector('svg').getBoundingClientRect(); return [r.width, r.height]; }")
        pg.set_viewport_size({'width': int(dims[0]) + 1, 'height': int(dims[1]) + 1})
        pg.screenshot(path=os.path.join(OUT, 'MUSE_ERD_Core.png'), timeout=120000)
        pg.close()
        html = os.path.join(BUILD, '_core.html')
        open(html, 'w', encoding='utf-8').write(PAGE.format(w=A3[0], h=A3[1], svg=svg_text(svg_path)))
        pg = b.new_page()
        pg.goto('file://' + html)
        pg.pdf(path=os.path.join(OUT, 'MUSE_ERD_Core.pdf'), width=A3[0], height=A3[1], print_background=True,
               margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        b.close()
    dot_edges = len(re.findall(r'<g[^>]*class="edge"', raw)) - 3
    inter = raw.count('<path d="M')   # compose draws each between-area relationship as one path
    from pypdf import PdfReader
    text = PdfReader(os.path.join(OUT, 'MUSE_ERD_Core.pdf')).pages[0].extract_text() or ''
    res = {'tableBoxes': r['nodes'] - 6, 'overflowingTexts': r['overflow'], 'missingEntities': missing, 'missingColumns': cols_missing,
           'relationshipLinesDrawn': dot_edges + inter, 'expectedRelationships': n_rels,
           'pdfEntityNamesAsText': sum(1 for t in CORE if t in text)}
    rep = json.load(open(os.path.join(OUT, 'core-mapping.json')))
    rep['rendering'] = res
    json.dump(rep, open(os.path.join(OUT, 'core-mapping.json'), 'w'), indent=1)
    print(json.dumps(res))
    if r['overflow'] or missing or cols_missing or dot_edges + inter != n_rels:
        sys.exit('core diagram validation FAILED')
    print('core diagram render + validation OK')


if __name__ == '__main__':
    main()
