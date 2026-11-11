#!/usr/bin/env python3
"""
Diagram F — MUSE core ER diagram in the notation of "Database System Concepts"
(Silberschatz, Korth, Sudarshan):

  entity set        box with a coloured header and its attributes listed inside; primary key underlined
  relationship      diamond; an ARROW points to the "one" side (many-to-one / one-to-one)
  total participation   double line (every entity of that set takes part, i.e. the foreign key is NOT NULL)
  weak entity set   linked by a DOUBLE diamond (identifying relationship); its discriminator is dashed-underlined
  multivalued attr  { name } inside the box          derived attribute   name ()
  relationship attributes   a separate box joined to the diamond by a dashed line
  recursive relationship    role names written on the two lines

It reuses the entity / relationship model of build_chen.py (already validated against the live schema:
every relationship is backed by real foreign keys and all core foreign keys are covered). Attributes are
read from docs/erd/schema-model.json: every column of the table except foreign keys to other drawn
entities (those ARE the relationships). Foreign keys to supporting tables (e.g. language_id) stay listed.

  python3 backend/scripts/erd/build_korth.py   ->  docs/erd/MUSE_ERD_Korth.svg / .png / .pdf (A3 landscape)
"""
import math
import os
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(__file__))
import build_chen as CH  # noqa: E402

T, OUT, BUILD, W, H = CH.T, CH.OUT, CH.BUILD, CH.W, CH.H
SERIF = 'Liberation Serif, Times New Roman, serif'
SANS = 'Liberation Sans, Arial, sans-serif'

DRAWN = {e[2] for e in CH.ENTITIES} | {'song_genres', 'song_moods', 'song_mood_ratings', 'recommendation_items', 'playlist_songs'}
# values maintained by triggers / procedures (see the Phase 1 report, 5.7) are derived attributes too
DERIVED = {('listening_history', c) for c in ('completion_pct', 'completed', 'skipped', 'is_replay')} | \
          {('playlists', 'song_count'), ('playlists', 'total_duration_sec'),
           ('listening_sessions', 'plays'), ('listening_sessions', 'listen_sec')}
# total participation: (relationship, entity) whose foreign key is NOT NULL
TOTAL = {('has', 'profile'), ('performs', 'song'), ('played', 'play'), ('inside', 'play'), ('opens', 'session'),
         ('receives', 'batch'), ('owns', 'playlist')}
ROLES = {('merged', 0): 'canonical', ('merged', 1): 'duplicate', ('subgenre', 0): 'parent', ('subgenre', 1): 'sub-genre'}
# relationship-attribute boxes: offset from the diamond centre
RBOX = {'belongs': (0, -150), 'tagged': (250, 0), 'rates': (40, 175), 'recommends': (-290, -10), 'includes': (-250, -40)}
# a little more room than the Chen layout: boxes are taller than ellipses
POS = dict(CH.POS, **{
    'song': (2000, 1030), 'artist': (1050, 470), 'album': (2950, 450), 'genre': (3650, 1000), 'mood': (3700, 1850),
    'user': (2000, 2470), 'profile': (3250, 2560), 'session': (450, 2470), 'play': (450, 1640),
    'batch': (1250, 1880), 'playlist': (2420, 1850),
})
DPOS = dict(CH.DPOS, **{
    'performs': (1450, 760), 'contains': (2560, 760), 'merged': (2000, 560), 'belongs': (2900, 1000), 'subgenre': (3700, 520),
    'tagged': (3000, 1420), 'rates': (3000, 2020), 'has': (2700, 2560), 'opens': (1250, 2600), 'inside': (450, 2080),
    'played': (1000, 1180), 'camefrom': (850, 1760), 'receives': (1600, 2260), 'recommends': (1450, 1360),
    'seeded': (1850, 1480), 'owns': (2260, 2140), 'includes': (2300, 1420), 'savedfrom': (1850, 1880),
})


def attributes(eid):
    """(text, style) rows for the entity box: style key | discriminator | derived | plain."""
    _, label, table, weak, chen_attrs = CH.E[eid]
    tb = T[table]
    fk_drawn = {c for f in tb['fks'] if f['ref'] in DRAWN for c in f['cols']}
    rows = []
    for c in tb['columns']:
        n = c['name']
        if weak and n in tb['pk'] and n in fk_drawn:
            continue                      # a weak entity does not repeat its owner's key
        if n in fk_drawn and n not in tb['pk']:
            continue                      # shown as a relationship, not an attribute
        if n in tb['pk']:
            rows.append((n, 'key'))
        elif c['generated'] or (table, n) in DERIVED:
            rows.append((f'{n} ( )', 'plain'))
        else:
            rows.append((n, 'plain'))
    for a, src, kind in chen_attrs:       # multivalued attributes live in their own tables
        if kind == 'multi':
            rows.append((f'{{ {src.split(".")[1]} }}', 'plain'))
    return rows


def build_svg():
    lines, shapes, texts = [], [], []
    box = {}
    for eid, label, table, weak, _ in CH.ENTITIES:
        rows = attributes(eid)
        w = max(len(label) * 15 + 44, max(len(t) for t, _ in rows) * 11.6 + 36)
        h = 48 + len(rows) * 28 + 16
        x, y = POS[eid]
        box[eid] = (x - w / 2, y - h / 2, w, h, rows, table)
    dia = {}
    for rid, label, ident, parts, attrs, fks in CH.RELS:
        x, y = DPOS[rid]
        txt = label.replace('\n', ' ').replace(' (AI)', '')
        hw = max(78, len(txt) * 9.5 + 34)
        dia[rid] = (x, y, hw, 50, txt)

    def edge_point(eid, tx, ty, shift=(0, 0)):
        x0, y0, w, h = box[eid][:4]
        cx, cy = x0 + w / 2 + shift[0], y0 + h / 2 + shift[1]
        dx, dy = tx - cx, ty - cy
        s = min((w / 2) / abs(dx) if dx else 1e9, (h / 2) / abs(dy) if dy else 1e9)
        return cx + dx * s, cy + dy * s

    def seg(x1, y1, x2, y2, double=False, dashed=False):
        if double:
            L = math.hypot(x2 - x1, y2 - y1) or 1
            nx, ny = -(y2 - y1) / L * 3.2, (x2 - x1) / L * 3.2
            lines.append(f'<line x1="{x1 + nx:.1f}" y1="{y1 + ny:.1f}" x2="{x2 + nx:.1f}" y2="{y2 + ny:.1f}"/>')
            lines.append(f'<line x1="{x1 - nx:.1f}" y1="{y1 - ny:.1f}" x2="{x2 - nx:.1f}" y2="{y2 - ny:.1f}"/>')
        else:
            d = ' stroke-dasharray="7 5"' if dashed else ''
            lines.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"{d}/>')

    def arrow(px, py, fx, fy):
        L = math.hypot(px - fx, py - fy) or 1
        ux, uy = (px - fx) / L, (py - fy) / L
        a, b = 20, 8
        shapes.append(f'<polygon points="{px:.1f},{py:.1f} {px - ux * a - uy * b:.1f},{py - uy * a + ux * b:.1f} '
                      f'{px - ux * a + uy * b:.1f},{py - uy * a - ux * b:.1f}" fill="#222222"/>')

    for rid, label, ident, parts, attrs, fks in CH.RELS:
        dx, dy, hw, hh, _ = dia[rid]
        recursive = len(parts) == 2 and parts[0][0] == parts[1][0]
        ternary = len(parts) == 3
        for i, (eid, card) in enumerate(parts):
            shift = (0, 0)
            if recursive:
                x0, y0, w, h = box[eid][:4]
                shift = (-w / 4, 0) if i == 0 else (w / 4, 0)
                if abs(dx - (x0 + w / 2)) > abs(dy - (y0 + h / 2)):
                    shift = (0, -h / 5) if i == 0 else (0, h / 5)
            ex, ey = edge_point(eid, dx + shift[0], dy + shift[1], shift)
            seg(dx, dy, ex, ey, double=(rid, eid) in TOTAL)
            if card == '1' and not ternary:
                arrow(ex, ey, dx, dy)
            role = ROLES.get((rid, i))
            if role:
                mx, my = (ex * 0.5 + dx * 0.5), (ey * 0.5 + dy * 0.5)
                left = i == 0
                texts.append(f'<text x="{mx + (-14 if left else 14):.1f}" y="{my:.1f}" font-size="21" font-style="italic" '
                             f'text-anchor="{"end" if left else "start"}" font-family="{SERIF}">{role}</text>')
        if attrs:
            ox, oy = RBOX[rid]
            names = [a for a, _ in attrs]
            bw = max(len(n) for n in names) * 11.6 + 32
            bh = 20 + 28 * len(names)
            bx, by = dx + ox - bw / 2, dy + oy - bh / 2
            seg(dx, dy, dx + ox, dy + oy, dashed=True)
            shapes.append(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh}" fill="#FFFFFF" stroke="#333333" stroke-width="1.8"/>')
            for k, n in enumerate(names):
                texts.append(f'<text x="{bx + 15:.1f}" y="{by + 34 + k * 28:.1f}" font-size="23" font-style="italic" font-family="{SERIF}">{escape(n)}</text>')

    for eid, (x0, y0, w, h, rows, table) in box.items():
        label = CH.E[eid][1].lower().replace(' ', '_')
        shapes.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}" fill="#FFFFFF" stroke="#333333" stroke-width="2"/>')
        shapes.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="44" fill="#BFE3F0" stroke="#333333" stroke-width="2"/>')
        texts.append(f'<text x="{x0 + w / 2:.1f}" y="{y0 + 31:.1f}" font-size="27" font-style="italic" text-anchor="middle" font-family="{SERIF}">{escape(label)}</text>')
        for k, (t, style) in enumerate(rows):
            ty = y0 + 74 + k * 28
            texts.append(f'<text x="{x0 + 15:.1f}" y="{ty:.1f}" font-size="23" font-style="italic" font-family="{SERIF}"'
                         f'{" text-decoration=\"underline\"" if style == "key" else ""}>{escape(t)}</text>')

    for rid, label, ident, parts, attrs, fks in CH.RELS:
        x, y, hw, hh, txt = dia[rid]
        shapes.append(f'<polygon points="{x},{y - hh} {x + hw},{y} {x},{y + hh} {x - hw},{y}" fill="#E4F2F8" stroke="#333333" stroke-width="2"/>')
        if ident:
            shapes.append(f'<polygon points="{x},{y - hh + 9} {x + hw - 16},{y} {x},{y + hh - 9} {x - hw + 16},{y}" fill="none" stroke="#333333" stroke-width="1.8"/>')
        texts.append(f'<text x="{x:.1f}" y="{y + 7:.1f}" font-size="21" font-style="italic" text-anchor="middle" font-family="{SERIF}">{escape(txt)}</text>')

    head = (f'<text x="60" y="82" font-size="44" font-weight="bold" font-family="{SANS}" fill="#1A1A1A">MUSE — E-R Diagram</text>'
            f'<text x="60" y="124" font-size="21" font-family="{SANS}" fill="#555555">{len(CH.ENTITIES)} entity sets and {len(CH.RELS)} relationship sets of '
            'the core schema, in the notation of Database System Concepts (Silberschatz, Korth, Sudarshan).</text>'
            f'<text x="60" y="154" font-size="21" font-family="{SANS}" fill="#555555">Every column is listed; foreign keys to other entity sets '
            'appear as relationships. Generated and checked against the live MySQL schema.</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
           f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>{head}'
           f'<g stroke="#222222" stroke-width="2">{"".join(lines)}</g>{"".join(shapes)}'
           f'<g fill="#111111">{"".join(texts)}</g>{legend(W - 900, 50)}</svg>')
    return svg, box, dia


def legend(x0, y0):
    rows = [
        ('box', 'Entity set (attributes inside, primary key underlined)'),
        ('diamond', 'Relationship set'),
        ('arrow', 'Arrow: points to the "one" side'),
        ('double', 'Double line: total participation'),
        ('ddiamond', 'Identifying relationship of a weak entity set'),
        ('dashed', 'Dashed line: attributes of a relationship set'),
        ('text', '{ x } multivalued attribute     x ( ) derived attribute'),
    ]
    h = 70 + 46 * len(rows)
    s = [f'<rect x="{x0}" y="{y0}" width="840" height="{h}" rx="12" fill="#F7FBFD" stroke="#5A8FA6" stroke-width="2"/>',
         f'<text x="{x0 + 20}" y="{y0 + 36}" font-size="22" font-weight="bold" font-family="{SANS}" fill="#24546A">Notation</text>']
    for i, (k, t) in enumerate(rows):
        cy = y0 + 76 + i * 46
        cx = x0 + 70
        if k == 'box':
            s.append(f'<rect x="{cx - 40}" y="{cy - 17}" width="80" height="34" fill="#FFFFFF" stroke="#333" stroke-width="2"/>'
                     f'<rect x="{cx - 40}" y="{cy - 17}" width="80" height="12" fill="#BFE3F0" stroke="#333" stroke-width="2"/>')
        elif k in ('diamond', 'ddiamond'):
            s.append(f'<polygon points="{cx},{cy - 18} {cx + 34},{cy} {cx},{cy + 18} {cx - 34},{cy}" fill="#E4F2F8" stroke="#333" stroke-width="2"/>')
            if k == 'ddiamond':
                s.append(f'<polygon points="{cx},{cy - 11} {cx + 22},{cy} {cx},{cy + 11} {cx - 22},{cy}" fill="none" stroke="#333" stroke-width="1.6"/>')
        elif k == 'arrow':
            s.append(f'<line x1="{cx - 40}" y1="{cy}" x2="{cx + 22}" y2="{cy}" stroke="#222" stroke-width="2"/>'
                     f'<polygon points="{cx + 40},{cy} {cx + 20},{cy - 8} {cx + 20},{cy + 8}" fill="#222"/>')
        elif k == 'double':
            s.append(f'<line x1="{cx - 40}" y1="{cy - 3}" x2="{cx + 40}" y2="{cy - 3}" stroke="#222" stroke-width="2"/>'
                     f'<line x1="{cx - 40}" y1="{cy + 3}" x2="{cx + 40}" y2="{cy + 3}" stroke="#222" stroke-width="2"/>')
        elif k == 'dashed':
            s.append(f'<line x1="{cx - 40}" y1="{cy}" x2="{cx + 40}" y2="{cy}" stroke="#222" stroke-width="2" stroke-dasharray="7 5"/>')
        s.append(f'<text x="{x0 + 140}" y="{cy + 7}" font-size="19" font-family="{SANS}" fill="#1A1A1A">{escape(t)}</text>')
    return ''.join(s)


def check(box, dia):
    """No two entity boxes / relationship boxes / diamonds may overlap."""
    rects = [(f'entity {k}', v[0], v[1], v[0] + v[2], v[1] + v[3]) for k, v in box.items()]
    rects += [(f'relationship {k}', v[0] - v[2], v[1] - v[3], v[0] + v[2], v[1] + v[3]) for k, v in dia.items()]
    rects.append(('legend', W - 900, 50, W - 60, 50 + 70 + 46 * 7))
    rects.append(('title', 60, 40, 2400, 165))
    bad = []
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            a, b = rects[i], rects[j]
            if a[1] < b[3] and b[1] < a[3] and a[2] < b[4] and b[2] < a[4]:
                bad.append(f'{a[0]} / {b[0]}')
    out = [r[0] for r in rects if r[1] < 0 or r[2] < 0 or r[3] > W or r[4] > H]
    return bad + [f'{o} outside the page' for o in out]


def main():
    n = CH.validate()
    os.makedirs(BUILD, exist_ok=True)
    svg, box, dia = build_svg()
    problems = check(box, dia)
    path = os.path.join(OUT, 'MUSE_ERD_Korth.svg')
    open(path, 'w', encoding='utf-8').write(svg)
    from playwright.sync_api import sync_playwright
    from render import PAGE, A3
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.set_viewport_size({'width': W, 'height': H})
        pg.set_content('<html><body style="margin:0">' + svg + '</body></html>')
        pg.screenshot(path=os.path.join(OUT, 'MUSE_ERD_Korth.png'))
        pg.close()
        html = os.path.join(BUILD, '_korth.html')
        open(html, 'w', encoding='utf-8').write(PAGE.format(w=A3[0], h=A3[1], svg=svg))
        pg = b.new_page()
        pg.goto('file://' + html)
        pg.pdf(path=os.path.join(OUT, 'MUSE_ERD_Korth.pdf'), width=A3[0], height=A3[1], print_background=True,
               margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        b.close()
    cols = sum(len(v[4]) for v in box.values())
    print(f'Korth-style diagram: {len(box)} entity sets ({cols} attribute rows), {len(dia)} relationship sets, '
          f'all {n} core foreign keys covered; layout problems: {problems or "none"}')
    if problems:
        sys.exit(1)


if __name__ == '__main__':
    main()
