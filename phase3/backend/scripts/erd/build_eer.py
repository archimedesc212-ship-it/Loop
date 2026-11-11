#!/usr/bin/env python3
"""
Diagram F — EER (Enhanced Entity-Relationship) diagram of MUSE, in Elmasri & Navathe notation:

  rectangle               entity (superclass or subclass)      double rectangle   weak entity
  ellipse                 attribute (underlined = key)         dashed underline   partial key of a weak entity
  diamond                 relationship                         double diamond     identifying relationship
  circle with d           disjoint specialization              ∪ on a line        subclass ⊂ superclass (opens toward the superclass)
  double line             total participation / total specialization
  text on a superclass line   defining attribute (attribute-defined specialization)

Specializations are not invented: each one is backed by a real NOT NULL type column of the superclass table
(an ENUM, or users.role_id → roles), so every row belongs to exactly one subclass (disjoint) and to at least one
(total). Subclass-specific attributes and relationships are backed by CHECK constraints or by role permissions.
The build reads the live schema (docs/erd/schema-model.json) and the role tables, and stops if anything differs.

  python3 backend/scripts/erd/build_eer.py  ->  docs/erd/MUSE_EER_Diagram.svg / .png / .pdf (A2 landscape)
Developed by Vaishnav Sai.
"""
import json
import math
import os
import re
import sys
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'erd')
BUILD = os.path.join(OUT, '.build')
T = json.load(open(os.path.join(OUT, 'schema-model.json')))['tables']
FONT = 'Liberation Sans, Arial, Helvetica, sans-serif'
W, H = 5300, 3850
A2 = ('594mm', '420mm')
CREDIT = 'Developed by Vaishnav Sai'

# ------------------------------------------------------------------ entities: id -> (label, table, x, y, kind)
# kind: 'super' (has a specialization), 'sub' (subclass), 'entity', 'weak'
ENT = {
    'artist': ('ARTIST', 'artists', 900, 1080, 'super'),
    'a_solo': ('SOLO ARTIST', 'artists', 420, 520, 'sub'), 'a_group': ('GROUP', 'artists', 760, 520, 'sub'),
    'a_comp': ('COMPOSER', 'artists', 1080, 520, 'sub'), 'a_orch': ('ORCHESTRA', 'artists', 1400, 520, 'sub'),
    'album': ('ALBUM', 'albums', 2700, 1050, 'super'),
    'al_studio': ('STUDIO ALBUM', 'albums', 1960, 520, 'sub'), 'al_ep': ('EP', 'albums', 2300, 520, 'sub'),
    'al_single': ('SINGLE', 'albums', 2590, 520, 'sub'), 'al_comp': ('COMPILATION', 'albums', 2920, 520, 'sub'),
    'al_sound': ('SOUNDTRACK', 'albums', 3300, 520, 'sub'),
    'film': ('FILM', 'films', 4150, 520, 'entity'),
    'song': ('SONG', 'songs', 2700, 1550, 'entity'),
    'genre': ('GENRE', 'genres', 4250, 1250, 'entity'),
    'mood': ('MOOD', 'moods', 4250, 1950, 'entity'),
    'model': ('INTELLIGENCE MODEL', 'intelligence_models', 4250, 2550, 'super'),
    'm_audio': ('AUDIO MODEL', 'intelligence_models', 3550, 3110, 'sub'), 'm_mood': ('MOOD MODEL', 'intelligence_models', 3850, 3110, 'sub'),
    'm_seg': ('SEGMENT MODEL', 'intelligence_models', 4150, 3110, 'sub'), 'm_pref': ('PREFERENCE MODEL', 'intelligence_models', 4460, 3110, 'sub'),
    'm_rec': ('RECOMMENDER', 'intelligence_models', 4770, 3110, 'sub'), 'm_world': ('WORLD MODEL', 'intelligence_models', 5070, 3110, 'sub'),
    'session': ('LISTENING SESSION', 'listening_sessions', 500, 1800, 'entity'),
    'batch': ('RECOMMENDATION BATCH', 'recommendation_batches', 1500, 2150, 'entity'),
    'user': ('USER', 'users', 1300, 2600, 'super'),
    'profile': ('USER PROFILE', 'user_profiles', 330, 2950, 'weak'),
    'listener': ('LISTENER', 'users', 850, 3110, 'sub'), 'staff': ('STAFF', 'users', 1750, 3110, 'sub'),
    'curator': ('CURATOR', 'users', 1450, 3560, 'sub'), 'admin': ('ADMINISTRATOR', 'users', 2050, 3560, 'sub'),
    'playlist': ('PLAYLIST', 'playlists', 2950, 2350, 'super'),
    'p_manual': ('MANUAL', 'playlists', 2400, 2870, 'sub'), 'p_smart': ('SMART', 'playlists', 2730, 2870, 'sub'),
    'p_mix': ('SAVED MIX', 'playlists', 3060, 2870, 'sub'), 'p_world': ('WORLD', 'playlists', 3380, 2870, 'sub'),
    'review': ('REVIEW ITEM', 'review_queue', 2950, 3310, 'entity'),
    'job': ('PIPELINE JOB', 'pipeline_jobs', 3250, 3560, 'entity'),
}

# ------------------------------------------------------------------ specializations
# (superclass, circle x, y, defining text, (table, column), {subclass: discriminator value}, note)
# value '*' = role names; for users the values are role names read from the roles table.
SPECS = [
    ('artist', 900, 800, 'artist_type', ('artists', 'artist_type'),
     {'a_solo': 'SOLO', 'a_group': 'GROUP', 'a_comp': 'COMPOSER', 'a_orch': 'ORCHESTRA'}),
    ('album', 2700, 800, 'album_type', ('albums', 'album_type'),
     {'al_studio': 'ALBUM', 'al_ep': 'EP', 'al_single': 'SINGLE', 'al_comp': 'COMPILATION', 'al_sound': 'SOUNDTRACK'}),
    ('model', 4250, 2840, 'kind', ('intelligence_models', 'kind'),
     {'m_audio': 'AUDIO_FEATURES', 'm_mood': 'MOOD', 'm_seg': 'SEGMENTS', 'm_pref': 'PREFERENCE', 'm_rec': 'RECOMMENDER', 'm_world': 'WORLD'}),
    ('playlist', 2950, 2630, 'kind', ('playlists', 'kind'),
     {'p_manual': 'MANUAL', 'p_smart': 'SMART', 'p_mix': 'SAVED_MIX', 'p_world': 'WORLD'}),
    ('user', 1300, 2870, 'role', ('users', 'role_id'), {'listener': 'ROLE:Listener', 'staff': 'ROLE:Curator|Administrator'}),
    ('staff', 1750, 3330, 'role', ('users', 'role_id'), {'curator': 'ROLE:Curator', 'admin': 'ROLE:Administrator'}),
]

# ------------------------------------------------------------------ relationships
# id -> (label, x, y, identifying?, [(entity, cardinality, total?)], [(attr label, table.column)], [backing FK (table, first col)])
RELS = {
    'performs': ('performs', 1800, 1320, False, [('artist', '1', False), ('song', 'N', True)], [], [('songs', 'primary_artist_id')]),
    'contains': ('contains', 2700, 1300, False, [('album', '1', False), ('song', 'N', False)], [], [('songs', 'album_id')]),
    'basedon': ('based on', 3720, 520, False, [('al_sound', 'N', False), ('film', '1', False)], [], [('albums', 'film_id')]),
    'belongs': ('belongs to', 3500, 1400, False, [('song', 'M', False), ('genre', 'N', False)],
                [('is_primary', 'song_genres.is_primary')], [('song_genres', 'song_id'), ('song_genres', 'genre_id')]),
    'subgenre': ('sub-genre of', 4800, 1000, False, [('genre', '1', False), ('genre', 'N', False)], [], [('genres', 'parent_genre_id')]),
    'tagged': ('tagged with', 3500, 1900, False, [('song', 'M', False), ('mood', 'N', False), ('model', 'P', False)],
               [('confidence', 'song_moods.confidence')], [('song_moods', 'song_id'), ('song_moods', 'mood_id'), ('song_moods', 'model_id')]),
    'played': ('played in', 1600, 1650, False, [('session', 'M', False), ('song', 'N', False)],
               [('listened_sec', 'listening_history.listened_sec'), ('completed', 'listening_history.completed')],
               [('listening_history', 'session_id'), ('listening_history', 'song_id')]),
    'opens': ('opens', 760, 2250, False, [('user', '1', False), ('session', 'N', True)], [], [('listening_sessions', 'user_id')]),
    'receives': ('receives', 1400, 2380, False, [('user', '1', False), ('batch', 'N', True)], [], [('recommendation_batches', 'user_id')]),
    'recommends': ('recommends', 2200, 1880, False, [('batch', 'M', False), ('song', 'N', False)],
                   [('final_score', 'recommendation_items.final_score')], [('recommendation_items', 'batch_id'), ('recommendation_items', 'song_id')]),
    'has': ('has', 790, 2790, True, [('user', '1', False), ('profile', '1', True)], [], [('user_profiles', 'user_id')]),
    'owns': ('owns', 2100, 2520, False, [('user', '1', False), ('playlist', 'N', True)], [], [('playlists', 'user_id')]),
    'includes': ('includes', 2850, 1960, False, [('playlist', 'M', False), ('song', 'N', False)],
                 [('position', 'playlist_songs.position')], [('playlist_songs', 'playlist_id'), ('playlist_songs', 'song_id')]),
    'decides': ('decides', 2350, 3240, False, [('staff', '1', False), ('review', 'N', False)], [], [('review_queue', 'decided_by')]),
    'requests': ('requests', 2650, 3560, False, [('admin', '1', False), ('job', 'N', False)], [], [('pipeline_jobs', 'requested_by')]),
}

# ------------------------------------------------------------------ attributes: owner -> [(label, column, kind, x, y)]
ATTR = {
    'artist': [('artist_id', 'artist_id', 'key', 560, 1020), ('name', 'name', 'attr', 560, 1140)],
    'album': [('album_id', 'album_id', 'key', 3080, 1000), ('title', 'title', 'attr', 3080, 1100)],
    'film': [('film_id', 'film_id', 'key', 4560, 460), ('title', 'title', 'attr', 4560, 580)],
    'song': [('song_id', 'song_id', 'key', 3130, 1630), ('title', 'title', 'attr', 2500, 1790)],
    'genre': [('genre_id', 'genre_id', 'key', 4660, 1300), ('name', 'name', 'attr', 4660, 1400)],
    'mood': [('mood_id', 'mood_id', 'key', 4660, 1900), ('name', 'name', 'attr', 4660, 2000)],
    'model': [('model_id', 'model_id', 'key', 4720, 2500), ('version', 'version', 'attr', 4720, 2600)],
    'session': [('session_id', 'session_id', 'key', 200, 1720), ('device', 'device', 'attr', 200, 1880)],
    'batch': [('batch_id', 'batch_id', 'key', 1050, 2050), ('strategy', 'strategy', 'attr', 1050, 2150)],
    'user': [('user_id', 'user_id', 'key', 1640, 2730), ('username', 'username', 'attr', 960, 2560), ('email', 'email', 'attr', 1660, 2420)],
    'profile': [('user_id', 'user_id', 'partial', 120, 3120), ('display_name', 'display_name', 'attr', 470, 3160)],
    'playlist': [('playlist_id', 'playlist_id', 'key', 3420, 2300), ('name', 'name', 'attr', 3420, 2400)],
    'p_smart': [('smart_type', 'smart_type', 'attr', 2730, 3040)],
    'review': [('review_id', 'review_id', 'key', 3380, 3300), ('status', 'status', 'attr', 2950, 3460)],
    'job': [('job_id', 'job_id', 'key', 3680, 3510), ('job_type', 'job_type', 'attr', 3680, 3620)],
    # relationship attributes
    'played': [('listened_sec', 'listening_history.listened_sec', 'attr', 1380, 1520), ('completed', 'listening_history.completed', 'attr', 1820, 1520)],
    'tagged': [('confidence', 'song_moods.confidence', 'attr', 3330, 2060)],
    'belongs': [('is_primary', 'song_genres.is_primary', 'attr', 3500, 1240)],
    'recommends': [('final_score', 'recommendation_items.final_score', 'attr', 2120, 2050)],
    'includes': [('position', 'playlist_songs.position', 'attr', 3080, 2000)],
}


def tw(s, size):
    return len(s) * size * 0.56


def enum_values(table, col):
    c = next(x for x in T[table]['columns'] if x['name'] == col)
    return c, re.findall(r"'([^']*)'", c['type'])


def role_facts():
    """Role names and which roles hold the staff permissions, read from the live database."""
    import pymysql
    env = {}
    for line in open(os.path.join(ROOT, '.env'), encoding='utf-8'):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v
    c = pymysql.connect(host=env.get('DB_HOST', '127.0.0.1'), port=int(env.get('DB_PORT', 3306)), user=env['DB_OWNER_USER'],
                        password=env['DB_OWNER_PASSWORD'], database=env.get('DB_NAME', 'muse'))
    with c.cursor() as cur:
        cur.execute('SELECT name FROM roles')
        roles = {r[0] for r in cur.fetchall()}
        cur.execute("""SELECT r.name, GROUP_CONCAT(rp.permission_code ORDER BY rp.permission_code) FROM roles r
                       LEFT JOIN role_permissions rp ON rp.role_id = r.role_id GROUP BY r.name""")
        perms = {n: set((p or '').split(',')) - {''} for n, p in cur.fetchall()}
    c.close()
    return roles, perms


def validate():
    problems = []
    for eid, (label, table, x, y, kind) in ENT.items():
        if table not in T:
            problems.append(f'{eid}: no table {table}')
    for owner, attrs in ATTR.items():
        table = ENT[owner][1] if owner in ENT else None
        for lab, col, kind, x, y in attrs:
            t, c = col.split('.') if '.' in col else (table, col)
            if not any(x_['name'] == c for x_ in T[t]['columns']):
                problems.append(f'{owner}.{lab}: no column {t}.{c}')
            if kind == 'key' and T[t]['pk'] != [c]:
                problems.append(f'{owner}.{lab} drawn as key but primary key is {T[t]["pk"]}')
    for rid, (label, x, y, ident, parts, attrs, fks) in RELS.items():
        for t, c in fks:
            if not any(f['cols'][0] == c for f in T[t]['fks']):
                problems.append(f'{rid}: no foreign key {t}.{c}')
    # total participation on the N side of a 1:N relationship <=> its foreign key column is NOT NULL
    for rid, (label, x, y, ident, parts, attrs, fks) in RELS.items():
        if len(fks) == 1 and len(parts) == 2 and parts[0][0] != parts[1][0]:
            t, c = fks[0]
            nullable = next(x_['nullable'] for x_ in T[t]['columns'] if x_['name'] == c)
            many = next((p for p in parts if p[1] != '1'), parts[1])
            if many[2] == nullable:
                problems.append(f'{rid}: total participation of {many[0]} drawn as {many[2]} but {t}.{c} nullable={nullable}')
    # specializations
    roles, perms = role_facts()
    for sup, cx, cy, text, (t, col), subs in SPECS:
        c, vals = enum_values(t, col)
        if c['nullable']:
            problems.append(f'{sup}: {t}.{col} is nullable, so the specialization would not be total')
        if sup in ('user', 'staff'):
            continue
        if set(subs.values()) != set(vals):
            problems.append(f'{sup}: subclasses {sorted(subs.values())} differ from {t}.{col} values {vals}')
    if roles != {'Listener', 'Curator', 'Administrator'}:
        problems.append(f'roles changed: {roles}')
    staff_perms = {'catalog.write', 'review.decide'}
    staff_roles = {r for r, p in perms.items() if staff_perms <= p}
    if staff_roles != {'Curator', 'Administrator'}:
        problems.append(f'STAFF should be the roles holding {staff_perms}; found {staff_roles}')
    if 'pipeline.run' not in perms.get('Administrator', set()) or 'pipeline.run' in perms.get('Curator', set()):
        problems.append('requests (pipeline job) should be an Administrator-only permission')
    if perms.get('Listener'):
        problems.append(f'Listener unexpectedly has permissions {perms["Listener"]}')
    # subclass-specific attribute / relationship backed by CHECK constraints in the DDL
    ddl = open(os.path.join(ROOT, 'database', 'phase2', 'MUSE_Phase2_DDL.sql'), encoding='utf-8').read()
    if "(`film_id` is null) or (`album_type` = 'SOUNDTRACK')" not in ddl:
        problems.append('chk_albums_film (film only for SOUNDTRACK) not found')
    if "(`kind` = 'SMART') = (`smart_type` is not null)" not in ddl:
        problems.append('chk_pl_smart (smart_type only for SMART) not found')
    if problems:
        sys.exit('EER diagram does not match the schema:\n  ' + '\n  '.join(problems))


# ================================================================== drawing
def build_svg():
    lines, shapes, texts = [], [], []
    box = {}
    for eid, (label, table, x, y, kind) in ENT.items():
        size = 22 if kind != 'sub' else 19
        hw = max(95 if kind == "sub" else 120, tw(label, size) / 2 + 38)
        box[eid] = (x, y, hw, 34 if kind != 'sub' else 30)
    dia = {}
    for rid, (label, x, y, ident, parts, attrs, fks) in RELS.items():
        dia[rid] = (x, y, max(80, tw(label, 18) / 2 + 40), 50)

    def line(x1, y1, x2, y2, w=2, color='#333333', extra=''):
        lines.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{w}"{extra}/>')

    def double(x1, y1, x2, y2, gap=4.5):
        L = math.hypot(x2 - x1, y2 - y1) or 1
        nx, ny = -(y2 - y1) / L * gap, (x2 - x1) / L * gap
        line(x1 + nx, y1 + ny, x2 + nx, y2 + ny)
        line(x1 - nx, y1 - ny, x2 - nx, y2 - ny)

    def exit_rect(eid, tx, ty):
        x, y, hw, hh = box[eid]
        dx, dy = tx - x, ty - y
        s = min(hw / abs(dx) if dx else 1e9, hh / abs(dy) if dy else 1e9)
        return x + dx * s, y + dy * s

    def card(ex, ey, tx, ty, txt):
        L = math.hypot(tx - ex, ty - ey) or 1
        ux, uy = (tx - ex) / L, (ty - ey) / L
        d = min(70, 0.35 * L)
        px, py = ex + ux * d - uy * 16, ey + uy * d + ux * 16
        texts.append(f'<text x="{px:.1f}" y="{py + 7:.1f}" font-size="22" font-weight="bold" fill="#B03030" text-anchor="middle">{txt}</text>')

    # relationships
    for rid, (label, dx, dy, ident, parts, attrs, fks) in RELS.items():
        recursive = len(parts) == 2 and parts[0][0] == parts[1][0]
        for i, (eid, c, total) in enumerate(parts):
            x, y, hw, hh = box[eid]
            if recursive:
                ox = -40 if i == 0 else 40
                ex, ey = x + hw * 0.55 + ox, y - hh
                line(ex, ey, dx + (ox * 0.8), dy + (25 if i == 0 else -5)) if False else None
                tx, ty = (dx - 30, dy + 20) if i == 0 else (dx + 30, dy + 20)
                tx, ty = ((dx - dia[rid][2] * 0.5, dy + dia[rid][3] * 0.5) if i == 0 else (dx, dy + dia[rid][3]))
                line(ex, ey, tx, ty)
                card(ex, ey, tx, ty, c)
                continue
            ex, ey = exit_rect(eid, dx, dy)
            (double if total else line)(ex, ey, dx, dy)
            card(ex, ey, dx, dy, c)

    # specializations
    for sup, cx, cy, text, (t, col), subs in SPECS:
        x, y, hw, hh = box[sup]
        r = 30
        ex, ey = exit_rect(sup, cx, cy)
        L = math.hypot(cx - ex, cy - ey)
        ux, uy = (cx - ex) / L, (cy - ey) / L
        double(ex, ey, cx - ux * r, cy - uy * r, 4.5)           # total specialization: double line
        mx, my = (ex + cx) / 2, (ey + cy) / 2
        texts.append(f'<text x="{mx + 14:.1f}" y="{my + 6:.1f}" font-size="18" font-style="italic" fill="#1F4E8A">{escape(text)}</text>')
        for sid in subs:
            sx, sy, shw, shh = box[sid]
            tx, ty = exit_rect(sid, cx, cy)
            L2 = math.hypot(tx - cx, ty - cy)
            vx, vy = (tx - cx) / L2, (ty - cy) / L2
            line(cx + vx * r, cy + vy * r, tx, ty)
            # subset symbol at the middle of the line, opening toward the circle (superclass)
            px, py = cx + vx * (r + (L2 - r) * 0.5), cy + vy * (r + (L2 - r) * 0.5)
            ang = math.degrees(math.atan2(vy, vx))
            shapes.append(f'<path d="M -9 -13 Q 13 -13 13 0 Q 13 13 -9 13" fill="none" stroke="#1F4E8A" stroke-width="2.6" '
                          f'transform="translate({px:.1f},{py:.1f}) rotate({ang:.1f})"/>')
        shapes.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#FFFFFF" stroke="#1F4E8A" stroke-width="2.6"/>')
        texts.append(f'<text x="{cx}" y="{cy + 9}" font-size="26" font-weight="bold" fill="#1F4E8A" text-anchor="middle">d</text>')

    # attributes
    for owner, attrs in ATTR.items():
        if owner in box:
            ox, oy = box[owner][:2]
        else:
            ox, oy = dia[owner][:2]
        for lab, col, kind, ax, ay in attrs:
            rx, ry = max(62, tw(lab, 17) / 2 + 20), 25
            line(ox, oy, ax, ay, 1.6, '#666666')
            shapes.append(f'<ellipse cx="{ax}" cy="{ay}" rx="{rx:.1f}" ry="{ry}" fill="#FFFFFF" stroke="#2F6F3E" stroke-width="1.8"/>')
            deco = ' text-decoration="underline"' if kind == 'key' else ''
            texts.append(f'<text x="{ax}" y="{ay + 6}" font-size="17" text-anchor="middle"{deco}>{escape(lab)}</text>')
            if kind == 'partial':
                h = tw(lab, 17) / 2
                texts.append(f'<line x1="{ax - h:.1f}" y1="{ay + 10}" x2="{ax + h:.1f}" y2="{ay + 10}" stroke="#1A1A1A" stroke-width="1.4" stroke-dasharray="5 3"/>')

    # entity boxes and diamonds (drawn over the lines)
    for eid, (label, table, x, y, kind) in ENT.items():
        _, _, hw, hh = box[eid]
        fill, stroke = ('#E8F3EA', '#1E5631') if kind != 'sub' else ('#EAF1FB', '#1F4E8A')
        shapes.append(f'<rect x="{x - hw:.1f}" y="{y - hh}" width="{2 * hw:.1f}" height="{2 * hh}" fill="{fill}" stroke="{stroke}" stroke-width="2.4"/>')
        if kind == 'weak':
            shapes.append(f'<rect x="{x - hw + 7:.1f}" y="{y - hh + 7}" width="{2 * hw - 14:.1f}" height="{2 * hh - 14}" fill="none" stroke="{stroke}" stroke-width="2"/>')
        size = 22 if kind != 'sub' else 19
        texts.append(f'<text x="{x}" y="{y + size * 0.36:.1f}" font-size="{size}" font-weight="bold" text-anchor="middle">{escape(label)}</text>')
    for rid, (label, x, y, ident, parts, attrs, fks) in RELS.items():
        _, _, hw, hh = dia[rid]
        shapes.append(f'<polygon points="{x},{y - hh} {x + hw:.1f},{y} {x},{y + hh} {x - hw:.1f},{y}" fill="#FFF7E0" stroke="#8A6D1F" stroke-width="2.2"/>')
        if ident:
            shapes.append(f'<polygon points="{x},{y - hh + 10} {x + hw - 18:.1f},{y} {x},{y + hh - 10} {x - hw + 18:.1f},{y}" fill="none" stroke="#8A6D1F" stroke-width="2"/>')
        texts.append(f'<text x="{x}" y="{y + 6}" font-size="18" font-style="italic" text-anchor="middle">{escape(label)}</text>')

    title = ('<text x="60" y="80" font-size="46" font-weight="bold" fill="#1A1A1A">MUSE — EER Diagram (Enhanced Entity-Relationship)</text>'
             f'<text x="60" y="124" font-size="21" fill="#555555">{sum(1 for e in ENT.values() if e[4] != "sub")} entity types, '
             f'{sum(1 for e in ENT.values() if e[4] == "sub")} subclasses in {len(SPECS)} specializations, {len(RELS)} relationships. '
             'Every specialization is defined by a real NOT NULL type column, so all are disjoint (d) and total (double line).</text>'
             '<text x="60" y="154" font-size="21" fill="#555555">Main attributes only (full attribute lists: Chen diagram and Phase 1 report). '
             'Generated and checked against the live MySQL schema.</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">'
           f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>{title}'
           f'<g>{"".join(lines)}</g>{"".join(shapes)}<g fill="#1A1A1A">{"".join(texts)}</g>{legend(40, 3270)}{notes(3880, 3350)}'
           f'<text x="{W - 60}" y="{H - 40}" font-size="18" fill="#777777" text-anchor="end">{CREDIT}</text></svg>')
    return svg


def legend(x0, y0):
    rows = [('rect', 'Entity (superclass / entity type)'), ('sub', 'Subclass'), ('rect2', 'Weak entity'),
            ('ellipse', 'Attribute (underlined = key)'), ('diamond', 'Relationship'), ('diamond2', 'Identifying relationship'),
            ('circle', 'Disjoint specialization (d)'), ('subset', 'Subset symbol: subclass ⊂ superclass'),
            ('double', 'Total participation / total specialization'), ('defining', 'Defining attribute of the specialization')]
    h = 44 * len(rows) + 92
    s = [f'<rect x="{x0}" y="{y0}" width="960" height="{h}" rx="14" fill="#F7F9FC" stroke="#1F4E8A" stroke-width="2"/>',
         f'<text x="{x0 + 22}" y="{y0 + 36}" font-size="22" font-weight="bold" fill="#1F4E8A">EER notation (Elmasri &amp; Navathe)</text>']
    for i, (k, txt) in enumerate(rows):
        cy, cx = y0 + 74 + i * 44, x0 + 90
        if k in ('rect', 'sub', 'rect2'):
            f, st = ('#EAF1FB', '#1F4E8A') if k == 'sub' else ('#E8F3EA', '#1E5631')
            s.append(f'<rect x="{cx - 44}" y="{cy - 15}" width="88" height="30" fill="{f}" stroke="{st}" stroke-width="2"/>')
            if k == 'rect2':
                s.append(f'<rect x="{cx - 38}" y="{cy - 9}" width="76" height="18" fill="none" stroke="{st}" stroke-width="1.6"/>')
        elif k == 'ellipse':
            s.append(f'<ellipse cx="{cx}" cy="{cy}" rx="46" ry="16" fill="#FFF" stroke="#2F6F3E" stroke-width="2"/>'
                     f'<text x="{cx}" y="{cy + 5}" font-size="14" text-anchor="middle" text-decoration="underline">id</text>')
        elif k in ('diamond', 'diamond2'):
            s.append(f'<polygon points="{cx},{cy - 19} {cx + 40},{cy} {cx},{cy + 19} {cx - 40},{cy}" fill="#FFF7E0" stroke="#8A6D1F" stroke-width="2"/>')
            if k == 'diamond2':
                s.append(f'<polygon points="{cx},{cy - 12} {cx + 26},{cy} {cx},{cy + 12} {cx - 26},{cy}" fill="none" stroke="#8A6D1F" stroke-width="1.6"/>')
        elif k == 'circle':
            s.append(f'<circle cx="{cx}" cy="{cy}" r="18" fill="#FFF" stroke="#1F4E8A" stroke-width="2.4"/>'
                     f'<text x="{cx}" y="{cy + 7}" font-size="20" font-weight="bold" fill="#1F4E8A" text-anchor="middle">d</text>')
        elif k == 'subset':
            s.append(f'<line x1="{cx}" y1="{cy - 20}" x2="{cx}" y2="{cy + 20}" stroke="#333" stroke-width="2"/>'
                     f'<path d="M -9 -13 Q 13 -13 13 0 Q 13 13 -9 13" fill="none" stroke="#1F4E8A" stroke-width="2.6" transform="translate({cx},{cy}) rotate(-90)"/>')
        elif k == 'double':
            s.append(f'<line x1="{cx - 44}" y1="{cy - 4}" x2="{cx + 44}" y2="{cy - 4}" stroke="#333" stroke-width="2"/>'
                     f'<line x1="{cx - 44}" y1="{cy + 4}" x2="{cx + 44}" y2="{cy + 4}" stroke="#333" stroke-width="2"/>')
        else:
            s.append(f'<text x="{cx}" y="{cy + 6}" font-size="18" font-style="italic" fill="#1F4E8A" text-anchor="middle">kind</text>')
        s.append(f'<text x="{x0 + 170}" y="{cy + 7}" font-size="19" fill="#1A1A1A">{escape(txt)}</text>')
    s.append(f'<text x="{x0 + 22}" y="{y0 + h - 18}" font-size="17" fill="#444">1, N, M, P = cardinality · subset symbol opens toward the superclass</text>')
    return ''.join(s)


def notes(x0, y0):
    rows = ['How the specializations are stored (single-table mapping):',
            '• ARTIST, ALBUM, PLAYLIST, INTELLIGENCE MODEL: one table each, subclass = ENUM type column.',
            '• USER → LISTENER / STAFF → CURATOR / ADMINISTRATOR: users.role_id → roles;',
            '   STAFF = roles holding catalog.write + review.decide (Curator, Administrator).',
            '• SOUNDTRACK alone may be based on a FILM: CHECK chk_albums_film.',
            '• SMART alone has smart_type: CHECK chk_pl_smart.',
            '• requests (pipeline job) needs pipeline.run, which only Administrator holds.']
    s = [f'<rect x="{x0}" y="{y0}" width="1380" height="{38 * len(rows) + 30}" rx="12" fill="#FFFDF5" stroke="#B08A2E" stroke-width="1.8"/>']
    for i, r in enumerate(rows):
        s.append(f'<text x="{x0 + 22}" y="{y0 + 42 + i * 38}" font-size="19" {"font-weight=\"bold\" " if i == 0 else ""}fill="#1A1A1A">{escape(r)}</text>')
    return ''.join(s)


def render(svg_path):
    from playwright.sync_api import sync_playwright
    sys.path.insert(0, os.path.dirname(__file__))
    from render import PAGE
    svg = open(svg_path, encoding='utf-8').read()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(device_scale_factor=1)
        pg.set_viewport_size({'width': W, 'height': H})
        pg.set_content('<html><body style="margin:0">' + svg + '</body></html>')
        overlaps = pg.evaluate("""() => {
          const t = [...document.querySelectorAll('svg text')].map(e => ({ s: e.textContent, b: e.getBBox() }));
          const out = [];
          for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
            const a = t[i].b, c = t[j].b;
            if (a.x < c.x + c.width - 2 && c.x < a.x + a.width - 2 && a.y < c.y + c.height - 2 && c.y < a.y + a.height - 2) out.push(t[i].s + ' / ' + t[j].s);
          }
          return out; }""")
        pg.screenshot(path=os.path.join(OUT, 'MUSE_EER_Diagram.png'))
        pg.close()
        html = os.path.join(BUILD, '_eer.html')
        open(html, 'w', encoding='utf-8').write(PAGE.format(w=A2[0], h=A2[1], svg=svg))
        pg = b.new_page()
        pg.goto('file://' + html)
        pg.pdf(path=os.path.join(OUT, 'MUSE_EER_Diagram.pdf'), width=A2[0], height=A2[1], print_background=True,
               margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        b.close()
    return overlaps


def main():
    validate()
    os.makedirs(BUILD, exist_ok=True)
    path = os.path.join(OUT, 'MUSE_EER_Diagram.svg')
    open(path, 'w', encoding='utf-8').write(build_svg())
    overlaps = render(path)
    n_sub = sum(1 for e in ENT.values() if e[4] == 'sub')
    print(f'EER diagram: {len(ENT) - n_sub} entity types, {n_sub} subclasses, {len(SPECS)} specializations, {len(RELS)} relationships; '
          f'text overlaps: {overlaps or "none"}')
    if overlaps:
        sys.exit(1)


if __name__ == '__main__':
    main()
