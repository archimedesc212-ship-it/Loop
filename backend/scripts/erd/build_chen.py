#!/usr/bin/env python3
"""
Diagram E — Chen-notation ER diagram of MUSE's core entities (the classroom notation):

  rectangle         entity                     double rectangle   weak entity
  ellipse           attribute (key underlined) double ellipse     multi-valued attribute
  diamond           relationship               double diamond     identifying relationship of a weak entity
  line              connects attributes / entities to relationships; 1, N, M = cardinality

Every element is checked against the real schema (docs/erd/schema-model.json): each attribute must be a
real column, each relationship must be backed by the real foreign keys it names, and together the
relationships must cover every foreign key between the core tables. The build stops otherwise.

  python3 backend/scripts/erd/build_chen.py   ->  docs/erd/MUSE_ERD_Chen.svg / .png / .pdf (A3 landscape)
"""
import json
import os
import subprocess
import sys
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'erd')
BUILD = os.path.join(OUT, '.build')
T = json.load(open(os.path.join(OUT, 'schema-model.json')))['tables']
CORE = json.load(open(os.path.join(OUT, 'core-mapping.json')))['coreEntities']

# ------------------------------------------------------------------ entities
# (id, label, table, weak?, [(attribute label, column, kind)])  kind: key | attr | multi
# multi-valued attributes are stored in their own table (named in `column` as table.column)
ENTITIES = [
    ('user', 'USER', 'users', False, [
        ('user_id', 'user_id', 'key'), ('username', 'username', 'attr'), ('email', 'email', 'attr'),
        ('password_hash', 'password_hash', 'attr'), ('created_at', 'created_at', 'attr'),
        ('languages', 'user_languages.language_id', 'multi')]),
    ('profile', 'USER PROFILE', 'user_profiles', True, [
        ('display_name', 'display_name', 'attr'), ('region_code', 'region_code', 'attr'),
        ('content_filter', 'content_filter', 'attr')]),
    ('artist', 'ARTIST', 'artists', False, [
        ('artist_id', 'artist_id', 'key'), ('name', 'name', 'attr'), ('artist_type', 'artist_type', 'attr'),
        ('country_code', 'country_code', 'attr'), ('aliases', 'artist_aliases.alias', 'multi')]),
    ('album', 'ALBUM', 'albums', False, [
        ('album_id', 'album_id', 'key'), ('title', 'title', 'attr'), ('album_type', 'album_type', 'attr'),
        ('release_year', 'release_year', 'attr')]),
    ('song', 'SONG', 'songs', False, [
        ('song_id', 'song_id', 'key'), ('title', 'title', 'attr'), ('duration_sec', 'duration_sec', 'attr'),
        ('release_year', 'release_year', 'attr')]),
    ('genre', 'GENRE', 'genres', False, [
        ('genre_id', 'genre_id', 'key'), ('name', 'name', 'attr'), ('color_hex', 'color_hex', 'attr')]),
    ('mood', 'MOOD', 'moods', False, [
        ('mood_id', 'mood_id', 'key'), ('name', 'name', 'attr'), ('target_energy', 'target_energy', 'attr'),
        ('target_valence', 'target_valence', 'attr'), ('keywords', 'mood_keywords.phrase', 'multi')]),
    ('session', 'LISTENING SESSION', 'listening_sessions', False, [
        ('session_id', 'session_id', 'key'), ('device', 'device', 'attr'), ('started_at', 'started_at', 'attr'),
        ('status', 'status', 'attr')]),
    ('play', 'PLAY', 'listening_history', False, [
        ('play_id', 'play_id', 'key'), ('started_at', 'started_at', 'attr'), ('listened_sec', 'listened_sec', 'attr'),
        ('completed', 'completed', 'attr'), ('skipped', 'skipped', 'attr')]),
    ('batch', 'RECOMMENDATION BATCH', 'recommendation_batches', False, [
        ('batch_id', 'batch_id', 'key'), ('strategy', 'strategy', 'attr'), ('label', 'label', 'attr'),
        ('created_at', 'created_at', 'attr')]),
    ('playlist', 'PLAYLIST', 'playlists', False, [
        ('playlist_id', 'playlist_id', 'key'), ('name', 'name', 'attr'), ('kind', 'kind', 'attr'),
        ('song_count', 'song_count', 'attr')]),
]
# weak entity: identified by its owner's key (user_profiles.user_id is PK and FK) — shown as a partial key
WEAK_KEY = {'profile': ('user_id', 'user_id')}

# ------------------------------------------------------------------ relationships
# (id, label, identifying?, [(entity, cardinality)], [(attribute label, table.column)], [backing FKs as (table, first col)])
RELS = [
    ('has', 'has', True, [('user', '1'), ('profile', '1')], [], [('user_profiles', 'user_id')]),
    ('performs', 'performs', False, [('artist', '1'), ('song', 'N')], [], [('songs', 'primary_artist_id')]),
    ('contains', 'contains', False, [('album', '1'), ('song', 'N')], [], [('songs', 'album_id')]),
    ('merged', 'merged into', False, [('song', '1'), ('song', 'N')], [], [('songs', 'merged_into_song_id')]),
    ('belongs', 'belongs to', False, [('song', 'M'), ('genre', 'N')], [('is_primary', 'song_genres.is_primary')],
     [('song_genres', 'song_id'), ('song_genres', 'genre_id')]),
    ('subgenre', 'sub-genre of', False, [('genre', '1'), ('genre', 'N')], [], [('genres', 'parent_genre_id')]),
    ('tagged', 'tagged with\n(AI)', False, [('song', 'M'), ('mood', 'N')], [('confidence', 'song_moods.confidence')],
     [('song_moods', 'song_id'), ('song_moods', 'mood_id')]),
    ('rates', 'rates\nmood fit', False, [('user', 'M'), ('song', 'N'), ('mood', 'P')],
     [('match_percentage', 'song_mood_ratings.match_percentage'), ('review_text', 'song_mood_ratings.review_text')],
     [('song_mood_ratings', 'user_id'), ('song_mood_ratings', 'song_id'), ('song_mood_ratings', 'mood_id')]),
    ('opens', 'opens', False, [('user', '1'), ('session', 'N')], [], [('listening_sessions', 'user_id')]),
    ('inside', 'contains\nplays', False, [('session', '1'), ('play', 'N')], [], [('listening_history', 'session_id')]),
    ('played', 'of song', False, [('song', '1'), ('play', 'N')], [], [('listening_history', 'song_id')]),
    ('camefrom', 'came from', False, [('batch', '1'), ('play', 'N')], [], [('listening_history', 'batch_id')]),
    ('receives', 'receives', False, [('user', '1'), ('batch', 'N')], [], [('recommendation_batches', 'user_id')]),
    ('recommends', 'recommends', False, [('batch', 'M'), ('song', 'N')],
     [('rank_position', 'recommendation_items.rank_position'), ('final_score', 'recommendation_items.final_score')],
     [('recommendation_items', 'batch_id'), ('recommendation_items', 'song_id')]),
    ('seeded', 'seeded by', False, [('song', '1'), ('batch', 'N')], [], [('recommendation_batches', 'seed_song_id')]),
    ('owns', 'owns', False, [('user', '1'), ('playlist', 'N')], [], [('playlists', 'user_id')]),
    ('includes', 'includes', False, [('playlist', 'M'), ('song', 'N')],
     [('position', 'playlist_songs.position'), ('added_at', 'playlist_songs.added_at')],
     [('playlist_songs', 'playlist_id'), ('playlist_songs', 'song_id')]),
    ('savedfrom', 'saved from', False, [('batch', '1'), ('playlist', 'N')], [], [('playlists', 'source_batch_id')]),
]

E = {e[0]: e for e in ENTITIES}


def col_exists(spec, default_table):
    t, c = spec.split('.') if '.' in spec else (default_table, spec)
    return t in T and any(x['name'] == c for x in T[t]['columns'])


def validate():
    problems = []
    for eid, label, table, weak, attrs in ENTITIES:
        if table not in T:
            problems.append(f'entity {eid}: no table {table}')
        for a, c, kind in attrs:
            if not col_exists(c, table):
                problems.append(f'{eid}.{a}: no column {c}')
            if kind == 'key' and c not in T[table]['pk']:
                problems.append(f'{eid}.{a} is drawn as key but is not the primary key')
    covered = set()
    for rid, label, ident, parts, attrs, fks in RELS:
        for t, c in fks:
            hit = [f for f in T[t]['fks'] if f['cols'][0] == c]
            if not hit:
                problems.append(f'relationship {rid}: no FK {t}.{c}')
            covered.add((t, c))
        for a, c in attrs:
            if not col_exists(c, None):
                problems.append(f'relationship {rid}: no column {c}')
        for p, _ in parts:
            if p not in E:
                problems.append(f'relationship {rid}: unknown entity {p}')
    core_fks = {(t, f['cols'][0]) for t in CORE for f in T[t]['fks'] if f['ref'] in CORE}
    missing = core_fks - covered
    if missing:
        problems.append(f'foreign keys between core tables not drawn: {sorted(missing)}')
    if problems:
        sys.exit('Chen diagram does not match the schema:\n  ' + '\n  '.join(problems))
    return len(core_fks)




# ================================================================== layout (A3 landscape canvas, px)
W, H = 4200, 2970
POS = {   # entity centres
    'song': (2000, 1000), 'artist': (1150, 500), 'album': (2850, 500), 'genre': (3600, 950), 'mood': (3700, 1800),
    'user': (2000, 2420), 'profile': (3150, 2560), 'session': (520, 2420), 'play': (520, 1700),
    'batch': (1330, 1760), 'playlist': (2330, 1760),
}
DPOS = {  # relationship (diamond) centres
    'performs': (1500, 740), 'contains': (2500, 740), 'merged': (2000, 560), 'belongs': (2820, 950),
    'subgenre': (3980, 680), 'tagged': (2960, 1320), 'rates': (2960, 1980), 'has': (2600, 2500),
    'opens': (1250, 2540), 'inside': (520, 2070), 'played': (1000, 1160), 'camefrom': (930, 1760),
    'receives': (1620, 2130), 'recommends': (1420, 1290), 'seeded': (1780, 1400), 'owns': (2160, 2130),
    'includes': (2200, 1330), 'savedfrom': (1830, 1760),
}
# where an entity's attributes go: (start angle, end angle, radius) in degrees, 0 = right, 90 = down
ARC = {
    'song': [(-138, -102, 300), (-78, -42, 300)], 'artist': [(-170, -10, 300)], 'album': [(-175, -55, 300)],
    'genre': [(20, 160, 280)], 'mood': [(-75, 115, 270)], 'user': [(25, 160, 330)], 'profile': [(-60, 80, 330)],
    'session': [(100, 250, 300)], 'play': [(120, 245, 320)], 'batch': [(195, 250, 300), (100, 160, 300)],
    'playlist': [(15, 75, 320)],
}
RARC = {  # relationship attributes: (start, end, radius)
    'belongs': (-120, -60, 200), 'tagged': (-30, 30, 230), 'rates': (40, 140, 230),
    'recommends': (150, 215, 260), 'includes': (165, 200, 230),
}
FONT = 'Liberation Sans, Arial, Helvetica, sans-serif'


def tw(s, size):          # approximate text width (Liberation Sans ≈ Arial metrics)
    return len(s) * size * 0.56


def build_svg():
    import math
    out_lines, out_shapes, out_text = [], [], []
    ent = {}
    for eid, label, table, weak, attrs in ENTITIES:
        x, y = POS[eid]
        w = max(190 if eid != 'song' else 280, len(label) * 22 * 0.66 + 50)
        ent[eid] = (x, y, w / 2, 34)
    dia = {}
    for rid, label, ident, parts, attrs, fks in RELS:
        x, y = DPOS[rid]
        lines = label.split('\n')
        w = max(tw(l, 17) for l in lines) + 70
        dia[rid] = (x, y, max(w / 2, 78), 52 if len(lines) == 1 else 62)

    def line(x1, y1, x2, y2, extra=''):
        out_lines.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"{extra}/>')

    def box_exit(cx, cy, hw, hh, tx, ty):   # point where the segment centre->target leaves a rectangle
        dx, dy = tx - cx, ty - cy
        s = min(hw / abs(dx) if dx else 1e9, hh / abs(dy) if dy else 1e9)
        return cx + dx * s, cy + dy * s

    def card(ex, ey, dx, dy, txt):
        # label just outside the entity edge, offset to the side of the line
        L = math.hypot(dx, dy) or 1
        ux, uy = dx / L, dy / L
        d = min(95, 0.38 * L)             # far enough along its own line to be unambiguous
        px, py = ex + ux * d - uy * 15, ey + uy * d + ux * 15
        out_text.append(f'<text x="{px:.1f}" y="{py + 7:.1f}" font-size="22" font-weight="bold" fill="#B03030" text-anchor="middle">{txt}</text>')

    # ---- entity <-> relationship lines with cardinalities
    for rid, label, ident, parts, attrs, fks in RELS:
        dx_, dy_, _, _ = dia[rid]
        recursive = len(parts) == 2 and parts[0][0] == parts[1][0]
        for i, (eid, c) in enumerate(parts):
            x, y, hw, hh = ent[eid]
            sx, sy = x, y
            if recursive:            # two separate lines for a relationship of an entity with itself
                off = -45 if i == 0 else 45
                if abs(dx_ - x) > abs(dy_ - y):
                    sy = y + off * 0.5
                else:
                    sx = x + off
            ex, ey = box_exit(x, y, hw, hh, dx_ + (sx - x), dy_ + (sy - y)) if not recursive else (
                (sx, y - hh if dy_ < y else y + hh) if abs(dx_ - x) <= abs(dy_ - y) else (x + hw if dx_ > x else x - hw, sy))
            if ident:   # total participation of the weak entity: double line
                L = math.hypot(dx_ - ex, dy_ - ey)
                nx, ny = -(dy_ - ey) / L * 3.5, (dx_ - ex) / L * 3.5
                if eid == 'profile':
                    line(ex + nx, ey + ny, dx_ + nx, dy_ + ny); line(ex - nx, ey - ny, dx_ - nx, dy_ - ny)
                else:
                    line(ex, ey, dx_, dy_)
            else:
                line(ex, ey, dx_, dy_)
            card(ex, ey, dx_ - ex, dy_ - ey, c)

    # ---- attributes
    def attr_shapes(cx, cy, items, arcs, owner_hw, owner_hh, color):
        slots = []
        per = [0] * len(arcs)
        for i in range(len(items)):
            per[i % len(arcs) if len(arcs) > 1 else 0] += 1
        k = 0
        for (a0, a1, r), n in zip(arcs, per):
            for j in range(n):
                ang = math.radians(a0 + (a1 - a0) * ((j + 0.5) / n))
                rr = r + (75 if n > 3 and j % 2 else 0)      # stagger crowded arcs
                slots.append((cx + math.cos(ang) * (rr + owner_hw * 0.35 * abs(math.cos(ang))),
                               cy + math.sin(ang) * (rr * 0.78 + owner_hh)))
                k += 1
        for (lab, kind), (ax, ay) in zip(items, slots):
            rx, ry = max(62, tw(lab, 17) / 2 + 20), 25
            line(cx, cy, ax, ay, ' stroke="#555555"')
            fill = '#FFFFFF'
            out_shapes.append(f'<ellipse cx="{ax:.1f}" cy="{ay:.1f}" rx="{rx:.1f}" ry="{ry}" fill="{fill}" stroke="{color}" stroke-width="1.8"/>')
            if kind == 'multi':
                out_shapes.append(f'<ellipse cx="{ax:.1f}" cy="{ay:.1f}" rx="{rx - 6:.1f}" ry="{ry - 6}" fill="none" stroke="{color}" stroke-width="1.6"/>')
            deco = ''
            if kind == 'key':
                deco = ' text-decoration="underline"'
            out_text.append(f'<text x="{ax:.1f}" y="{ay + 6:.1f}" font-size="17" text-anchor="middle"{deco}>{escape(lab)}</text>')
            if kind == 'partial':      # weak entity's partial key: dashed underline
                hw_ = tw(lab, 17) / 2
                out_text.append(f'<line x1="{ax - hw_:.1f}" y1="{ay + 10:.1f}" x2="{ax + hw_:.1f}" y2="{ay + 10:.1f}" stroke="#1A1A1A" stroke-width="1.4" stroke-dasharray="5 3"/>')

    for eid, label, table, weak, attrs in ENTITIES:
        x, y, hw, hh = ent[eid]
        items = [(a, k) for a, c, k in attrs]
        if eid in WEAK_KEY:
            items = [(WEAK_KEY[eid][0], 'partial')] + items
        attr_shapes(x, y, items, ARC[eid], hw, hh, '#2F6F3E')
    for rid, label, ident, parts, attrs, fks in RELS:
        if attrs:
            x, y, hw, hh = dia[rid]
            a0, a1, r = RARC[rid]
            attr_shapes(x, y, [(a, 'attr') for a, c in attrs], [(a0, a1, r)], hw * 0.6, hh * 0.6, '#2F6F3E')

    # ---- entities and relationships on top of the lines
    for eid, label, table, weak, attrs in ENTITIES:
        x, y, hw, hh = ent[eid]
        out_shapes.append(f'<rect x="{x - hw:.1f}" y="{y - hh:.1f}" width="{2 * hw:.1f}" height="{2 * hh}" fill="#E8F3EA" stroke="#1E5631" stroke-width="2.4"/>')
        if weak:
            out_shapes.append(f'<rect x="{x - hw + 7:.1f}" y="{y - hh + 7:.1f}" width="{2 * hw - 14:.1f}" height="{2 * hh - 14}" fill="none" stroke="#1E5631" stroke-width="2"/>')
        out_text.append(f'<text x="{x:.1f}" y="{y + 8:.1f}" font-size="22" font-weight="bold" text-anchor="middle">{escape(label)}</text>')
    for rid, label, ident, parts, attrs, fks in RELS:
        x, y, hw, hh = dia[rid]
        pts = f'{x},{y - hh} {x + hw},{y} {x},{y + hh} {x - hw},{y}'
        out_shapes.append(f'<polygon points="{pts}" fill="#FFF7E0" stroke="#8A6D1F" stroke-width="2.2"/>')
        if ident:
            pts2 = f'{x},{y - hh + 10} {x + hw - 18},{y} {x},{y + hh - 10} {x - hw + 18},{y}'
            out_shapes.append(f'<polygon points="{pts2}" fill="none" stroke="#8A6D1F" stroke-width="2"/>')
        ls = label.split('\n')
        for i, l in enumerate(ls):
            yy = y + 6 + (i - (len(ls) - 1) / 2) * 20
            out_text.append(f'<text x="{x:.1f}" y="{yy:.1f}" font-size="17" font-style="italic" text-anchor="middle">{escape(l)}</text>')

    legend = legend_svg(W - 840, 60)
    title = ('<text x="60" y="80" font-size="44" font-weight="bold" fill="#1A1A1A">MUSE — ER Diagram (Chen notation)</text>'
             f'<text x="60" y="122" font-size="21" fill="#555555">{len(ENTITIES)} entities and {len(RELS)} relationships of the core schema; '
             'every relationship is a real foreign key (or a pair/triple of them for M:N and ternary relationships).</text>'
             '<text x="60" y="152" font-size="21" fill="#555555">Main attributes shown; every column is listed in the Phase 1 report, Appendix A. '
             'Cardinality: 1, N, M, P (ternary). Generated and checked against the live MySQL schema.</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">'
           f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>{title}'
           f'<g stroke="#333333" stroke-width="2">{"".join(out_lines)}</g>{"".join(out_shapes)}'
           f'<g fill="#1A1A1A">{"".join(out_text)}</g>{legend}</svg>')
    return svg


def legend_svg(x0, y0):
    rows = [
        ('rect', 'Rectangle', 'Entity'), ('ellipse', 'Ellipse', 'Attribute (underlined = key)'),
        ('diamond', 'Diamond', 'Relationship'), ('line', 'Line', 'Links attributes and entities to relationships'),
        ('ellipse2', 'Double ellipse', 'Multi-valued attribute'), ('rect2', 'Double rectangle', 'Weak entity'),
        ('diamond2', 'Double diamond', 'Identifying relationship (weak entity)'),
    ]
    h = 48 * len(rows) + 104
    s = [f'<g font-family="{FONT}"><rect x="{x0}" y="{y0}" width="780" height="{h}" rx="14" fill="#F6FBF6" stroke="#2F6F3E" stroke-width="2"/>',
         f'<text x="{x0 + 20}" y="{y0 + 36}" font-size="22" font-weight="bold" fill="#1E5631">Notation</text>']
    for i, (kind, fig, rep) in enumerate(rows):
        cy = y0 + 76 + i * 48
        cx = x0 + 290
        if kind == 'rect':
            s.append(f'<rect x="{cx - 40}" y="{cy - 15}" width="80" height="30" fill="#E8F3EA" stroke="#1E5631" stroke-width="2"/>')
        elif kind == 'rect2':
            s.append(f'<rect x="{cx - 40}" y="{cy - 15}" width="80" height="30" fill="#E8F3EA" stroke="#1E5631" stroke-width="2"/>'
                     f'<rect x="{cx - 34}" y="{cy - 9}" width="68" height="18" fill="none" stroke="#1E5631" stroke-width="1.6"/>')
        elif kind == 'ellipse':
            s.append(f'<ellipse cx="{cx}" cy="{cy}" rx="44" ry="17" fill="#FFFFFF" stroke="#2F6F3E" stroke-width="2"/>')
        elif kind == 'ellipse2':
            s.append(f'<ellipse cx="{cx}" cy="{cy}" rx="44" ry="17" fill="#FFFFFF" stroke="#2F6F3E" stroke-width="2"/>'
                     f'<ellipse cx="{cx}" cy="{cy}" rx="38" ry="11" fill="none" stroke="#2F6F3E" stroke-width="1.6"/>')
        elif kind in ('diamond', 'diamond2'):
            s.append(f'<polygon points="{cx},{cy - 19} {cx + 34},{cy} {cx},{cy + 19} {cx - 34},{cy}" fill="#FFF7E0" stroke="#8A6D1F" stroke-width="2"/>')
            if kind == 'diamond2':
                s.append(f'<polygon points="{cx},{cy - 12} {cx + 22},{cy} {cx},{cy + 12} {cx - 22},{cy}" fill="none" stroke="#8A6D1F" stroke-width="1.6"/>')
        else:
            s.append(f'<line x1="{cx - 44}" y1="{cy}" x2="{cx + 44}" y2="{cy}" stroke="#333333" stroke-width="2"/>')
        s.append(f'<text x="{x0 + 24}" y="{cy + 7}" font-size="19" fill="#1A1A1A">{fig}</text>')
        s.append(f'<text x="{x0 + 360}" y="{cy + 7}" font-size="19" fill="#1A1A1A">{escape(rep)}</text>')
    s.append(f'<text x="{x0 + 24}" y="{y0 + h - 24}" font-size="17" fill="#444444">Double line = total participation · 1, N, M, P = cardinality</text>')
    s.append('</g>')
    return ''.join(s)


def render(svg_path):
    from playwright.sync_api import sync_playwright
    sys.path.insert(0, os.path.dirname(__file__))
    from render import PAGE, A3
    svg = open(svg_path, encoding='utf-8').read()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(device_scale_factor=1)
        pg.set_viewport_size({'width': W, 'height': H})
        pg.set_content('<html><body style="margin:0">' + svg + '</body></html>')
        # overlap check: no two attribute ellipses / shapes' text boxes intersect
        overlaps = pg.evaluate("""() => {
          const t = [...document.querySelectorAll('svg > text, svg g[fill] > text')].map(e => ({ s: e.textContent, b: e.getBBox() }));
          const out = [];
          for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
            const a = t[i].b, c = t[j].b;
            if (a.x < c.x + c.width - 2 && c.x < a.x + a.width - 2 && a.y < c.y + c.height - 2 && c.y < a.y + a.height - 2) out.push(t[i].s + ' / ' + t[j].s);
          }
          return out; }""")
        pg.screenshot(path=os.path.join(OUT, 'MUSE_ERD_Chen.png'))
        pg.close()
        html = os.path.join(BUILD, '_chen.html')
        open(html, 'w', encoding='utf-8').write(PAGE.format(w=A3[0], h=A3[1], svg=svg))
        pg = b.new_page()
        pg.goto('file://' + html)
        pg.pdf(path=os.path.join(OUT, 'MUSE_ERD_Chen.pdf'), width=A3[0], height=A3[1], print_background=True,
               margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        b.close()
    return overlaps


def main():
    n = validate()
    os.makedirs(BUILD, exist_ok=True)
    missing = set(POS) ^ set(E) or set(DPOS) ^ {r[0] for r in RELS}
    if missing:
        sys.exit(f'layout out of sync: {missing}')
    path = os.path.join(OUT, 'MUSE_ERD_Chen.svg')
    open(path, 'w', encoding='utf-8').write(build_svg())
    overlaps = render(path)
    print(f'Chen diagram: {len(ENTITIES)} entities, {len(RELS)} relationships, all {n} core foreign keys covered; '
          f'text overlaps: {overlaps or "none"}')
    if overlaps:
        sys.exit(1)


if __name__ == '__main__':
    main()
