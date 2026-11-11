#!/usr/bin/env python3
"""
Builds every MUSE ER diagram from docs/erd/schema-model.json (written by
extract-schema.js from the live, fully migrated database):

  Diagram A  MUSE_ERD_Presentation.{svg,pdf,png}   A3 overview of the major entities
  Diagram B  MUSE_ERD_Full_Schema.{svg,pdf,png}    every table, PK / FK / unique keys
  Diagram C  MUSE_ERD_Conceptual.{svg,png}         recommendation data flow (conceptual)
  MUSE_ERD.mmd                                      Mermaid source (complete schema)
  MUSE_ERD_Editable.drawio                          diagrams.net file, 3 pages
  validation-report.json                            what was checked and the result

Every relationship line is generated from a real foreign key in the model; the
script refuses to draw a relationship that has no foreign key behind it.

  node backend/scripts/erd/extract-schema.js && python3 backend/scripts/erd/build_erd.py
"""
import html
import json
import os
import re
import subprocess
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(__file__))
from compose import Block, compose, render_svg  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'erd')
BUILD = os.path.join(OUT, '.build')
MODEL = json.load(open(os.path.join(OUT, 'schema-model.json')))
T = MODEL['tables']
FONT = 'Arial'          # resolved to Liberation Sans (Arial-metric) for layout; renders as Arial elsewhere
os.makedirs(BUILD, exist_ok=True)

# ----------------------------------------------------------------------------- groups
GROUPS = [
    ('g1', '1 · Users, Profiles & Access Control', '#EEF3FB', '#5B7DB1',
     ['roles', 'permissions', 'role_permissions', 'users', 'user_profiles', 'auth_sessions']),
    ('g2', '2 · Music Catalogue', '#EEF7EF', '#4F8A5B',
     ['languages', 'regions', 'artists', 'artist_aliases', 'films', 'albums', 'album_artists', 'songs', 'song_artists', 'genres', 'song_genres']),
    ('g3', '3 · Mood & Audio Intelligence', '#F6F0FA', '#7D5BA6',
     ['mood_categories', 'moods', 'mood_keywords', 'contexts', 'context_keywords', 'context_moods', 'intelligence_models', 'model_parameters',
      'audio_features', 'song_moods', 'mood_segments', 'song_mood_curations']),
    ('g4', '4 · Listening History & Feedback', '#FDF4EA', '#B07A35',
     ['listening_sessions', 'listening_history', 'playback_events', 'ratings', 'song_mood_ratings', 'user_likes', 'song_dismissals', 'search_history',
      'incognito_sessions', 'incognito_events']),
    ('g5', '5 · Recommendation Engine', '#FCEEEE', '#B05454',
     ['recommendation_batches', 'recommendation_batch_moods', 'recommendation_items', 'recommendation_reasons', 'reason_types']),
    ('g6', '6 · Playlists & Preferences', '#EAF6F6', '#3E8A8A',
     ['playlists', 'playlist_songs', 'user_languages', 'user_genre_preferences', 'user_artist_preferences', 'user_mood_preferences',
      'user_context_preferences']),
    ('g7', '7 · Music Sources & Data Pipeline', '#F2F2F2', '#6B6B6B',
     ['music_sources', 'song_media', 'source_records', 'pipeline_jobs', 'pipeline_job_logs', 'review_queue']),
    ('g8', '8 · MUSE World, Trends & Audit', '#FBF6E6', '#A38A2E',
     ['world_archetypes', 'archetype_moods', 'weekly_worlds', 'world_feedback', 'trend_snapshots', 'audit_logs', 'schema_migrations']),
]
GROUP_OF = {t: g for g in GROUPS for t in g[4]}
missing = sorted(set(T) - set(GROUP_OF))
extra = sorted(set(GROUP_OF) - set(T))
if missing or extra:
    sys.exit(f'group assignment does not match the schema: missing {missing}, unknown {extra}')

FKS = [f for t in T.values() for f in t['fks']]
FK_BY_KEY = {(f['table'], tuple(f['cols'])): f for f in FKS}


def fk(child, *cols):
    """Look up a real foreign key; abort if it does not exist (no invented relationships)."""
    f = FK_BY_KEY.get((child, tuple(cols)))
    if not f:
        sys.exit(f'no foreign key {child}({", ".join(cols)}) in the schema')
    return f


# ----------------------------------------------------------------------------- notation
def ends(f):
    """Crow's-foot ends for a foreign key.
    parent end: exactly one (||) when the FK is NOT NULL, zero or one (|o) when nullable.
    child end : zero or many (o<) — the database never forces a parent to have children —
                or zero or one (o|) when the FK columns are the child's PK or a unique key (1:1)."""
    parent = 'teeodot' if f['nullable'] else 'teetee'
    child = 'teeodot' if f['unique'] else 'crowodot'
    return parent, child


def mermaid_card(f):
    left = '|o' if f['nullable'] else '||'
    right = 'o|' if f['unique'] else 'o{'
    line = '--' if f['inPk'] else '..'      # identifying (FK part of the child PK) vs non-identifying
    return f'{left}{line}{right}'


def card_text(f):
    p = '0..1' if f['nullable'] else '1'
    c = '0..1' if f['unique'] else '0..*'
    return f'{p} : {c}'


def short_type(t):
    t = t.replace(' unsigned', '')
    if t.startswith('enum('):
        return 'enum'
    if t.startswith('decimal'):
        return t.replace('decimal', 'dec')
    return t


def key_columns(tb):
    """PK columns, then FK columns, then unique-key-only columns, each tagged."""
    pk = tb['pk']
    fkcols = {c: f for f in tb['fks'] for c in f['cols']}
    uk = {}
    for i, u in enumerate([u for u in tb['uniques']], 1):
        for c in u['cols']:
            uk.setdefault(c, []).append(f'U{i}' if len(tb['uniques']) > 1 else 'UK')
    order = list(pk) + [c['name'] for c in tb['columns'] if c['name'] in fkcols and c['name'] not in pk] + \
        [c['name'] for c in tb['columns'] if c['name'] in uk and c['name'] not in pk and c['name'] not in fkcols]
    cols = {c['name']: c for c in tb['columns']}
    rows = []
    for name in order:
        tags = []
        if name in pk:
            tags.append('PK')
        if name in fkcols:
            tags.append('FK')
        tags += uk.get(name, [])
        c = cols[name]
        typ = short_type(c['type']) + (' · gen' if c['generated'] else '') + (' · null' if c['nullable'] else '')
        rows.append((name, ' '.join(tags), typ))
    return rows, len(tb['columns']) - len(order)


# ----------------------------------------------------------------------------- dot helpers
def q(s):
    return '"' + s.replace('"', '\\"') + '"'


def node_full(name, fill, border, compact=False, stub=False):
    """HTML-like table node. Each key column row has a PORT so edges attach to the FK column."""
    tb = T[name]
    if stub:
        return (f'{q(name)} [shape=plaintext, label=<<TABLE BORDER="1" STYLE="dashed" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5" '
                f'COLOR="{border}" BGCOLOR="#FFFFFF"><TR><TD><FONT COLOR="#333333">{name}</FONT></TD></TR>'
                f'<TR><TD><FONT POINT-SIZE="8" COLOR="#777777">{escape(GROUP_OF[name][1])}</FONT></TD></TR></TABLE>>];')
    rows, rest = key_columns(tb)
    out = [f'<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="{border}" BGCOLOR="#FFFFFF">',
           f'<TR><TD COLSPAN="3" BGCOLOR="{fill}" CELLPADDING="5"><B>{name}</B></TD></TR>']
    for col, tags, typ in rows:
        bold = col in tb['pk']
        c = f'<B>{col}</B>' if bold else col
        out.append(f'<TR><TD ALIGN="LEFT" PORT="L_{col}"><FONT POINT-SIZE="8" COLOR="#555555">{tags}</FONT></TD>'
                   f'<TD ALIGN="LEFT">{c}</TD><TD ALIGN="LEFT" PORT="R_{col}"><FONT POINT-SIZE="8" COLOR="#777777">{escape(typ)}</FONT></TD></TR>')
    if rest and not compact:
        out.append(f'<TR><TD COLSPAN="3" ALIGN="LEFT"><FONT POINT-SIZE="8" COLOR="#888888"><I>+ {rest} other column{"s" if rest != 1 else ""}</I></FONT></TD></TR>')
    out.append('</TABLE>')
    return f'{q(name)} [shape=plaintext, label=<{"".join(out)}>];'


def edge_dot(f, label=None, ports=True, color='#444444', penwidth=1.1, extra=''):
    parent, child = ends(f)
    style = 'solid' if f['inPk'] else 'dashed'
    tp = f':"R_{f["cols"][0]}"' if ports else ''
    hp = f':"L_{f["refCols"][0]}"' if ports else ''
    lab = f', label=<<FONT POINT-SIZE="9">{escape(label)}</FONT>>' if label else ''
    return (f'{q(f["table"])}{tp} -> {q(f["ref"])}{hp} [dir=both, arrowtail={child}, arrowhead={parent}, arrowsize=0.9, '
            f'style={style}, color="{color}", penwidth={penwidth}{lab}{extra}];')


def legend_cluster(name='legend', process=False):
    ex = [
        ('lg_a1', 'lg_b1', 'crowodot', 'teetee', 'solid', '0..* → exactly 1 (FK NOT NULL)'),
        ('lg_a2', 'lg_b2', 'crowodot', 'teeodot', 'dashed', '0..* → 0..1 (FK nullable)'),
        ('lg_a3', 'lg_b3', 'teeodot', 'teetee', 'solid', '1 : 0..1 (FK is the PK or unique)'),
    ]
    out = [f'subgraph cluster_{name} {{ label=<<B>Notation (crow\'s foot)</B>>; fontname="{FONT}"; fontsize=12; style="rounded"; color="#999999"; margin=10;']
    for a, b, tail, head, style, text in ex:
        out.append(f'{a} [shape=box, label="child", fontsize=9, width=0.6, height=0.3, style="rounded", color="#666666"];')
        out.append(f'{b} [shape=box, label="parent", fontsize=9, width=0.6, height=0.3, style="rounded", color="#666666"];')
        out.append(f'{a} -> {b} [dir=both, arrowtail={tail}, arrowhead={head}, style={style}, color="#444444", '
                   f'label=<<FONT POINT-SIZE="9">{escape(text)}</FONT>>, minlen=1];')
    notes = ['Crow&#39;s foot = many · bar = one · circle = zero (optional)',
             'Solid line: identifying (FK is part of the child&#39;s PK)',
             'Dashed line: non-identifying relationship',
             'PK primary key · FK foreign key',
             'UK, U1, U2: unique key (same tag = one composite key)',
             '&quot;gen&quot; generated column · &quot;null&quot; nullable']
    if process:
        notes.append('Blue numbered arrows: PROCESS STEPS, not foreign keys')
    rows = ''.join(f'<TR><TD ALIGN="LEFT"><FONT POINT-SIZE="9">{n}</FONT></TD></TR>' for n in notes)
    out.append(f'lg_notes [shape=plaintext, label=<<TABLE BORDER="0" CELLSPACING="0" CELLPADDING="2">{rows}</TABLE>>];')
    out.append('}')
    return '\n'.join(out)


def graph_header(title, subtitle, rankdir='LR', extra=''):
    lab = (f'<<FONT POINT-SIZE="26"><B>{escape(title)}</B></FONT><BR/>'
           f'<FONT POINT-SIZE="12" COLOR="#555555">{escape(subtitle)}</FONT><BR/> >')
    return (f'digraph MUSE {{\n graph [fontname="{FONT}", rankdir={rankdir}, bgcolor="white", labelloc=t, labeljust=l, '
            f'label={lab}, pad=0.4, newrank=true, {extra}];\n'
            f' node [fontname="{FONT}", fontsize=10, color="#444444", fontcolor="#1A1A1A"];\n'
            f' edge [fontname="{FONT}", fontsize=9, fontcolor="#333333"];\n')


GEN = 'Generated from the live MySQL schema (baseline 01–06 + migrations ' + \
      ', '.join(m['version'] for m in MODEL['migrations'] if m['version'] != '0000') + ') by backend/scripts/erd/build_erd.py'

# ============================================================================= Diagram B — full schema
def group_dot(group):
    gid, label, fill, border, tables = group
    inside = set(tables)
    rel = [f for f in FKS if f['table'] in inside or f['ref'] in inside]
    outside = sorted({f['ref'] for f in rel if f['ref'] not in inside} | {f['table'] for f in rel if f['table'] not in inside})
    s = [graph_header(f'MUSE — {label}',
                      f'{len(tables)} tables in this group, {len(rel)} relationships; dashed boxes are tables of other groups · edge label = FK column(s) · ON DELETE rule',
                      extra='nodesep=0.35, ranksep=1.2, splines=true')]
    s.append(f' subgraph cluster_{gid} {{ label=<<B>{escape(label)}</B>>; fontsize=16; fontcolor="{border}"; style="filled,rounded"; '
             f'fillcolor="{fill}"; color="{border}"; margin=16;')
    for t in tables:
        s.append('  ' + node_full(t, fill, border))
    s.append(' }')
    for t in outside:
        s.append(' ' + node_full(t, None, GROUP_OF[t][3], stub=True))
    for f in rel:
        lab = f'{", ".join(f["cols"])} · {f["onDelete"]}'
        ports = f['table'] in inside and f['ref'] in inside
        s.append(' ' + edge_dot_mixed(f, lab, inside))
    s.append(legend_cluster(f'legend_{gid}'))
    s.append('}')
    return '\n'.join(s)


def edge_dot_mixed(f, label, inside):
    parent, child = ends(f)
    style = 'solid' if f['inPk'] else 'dashed'
    tp = f':"R_{f["cols"][0]}"' if f['table'] in inside else ''
    hp = f':"L_{f["refCols"][0]}"' if f['ref'] in inside else ''
    return (f'{q(f["table"])}{tp} -> {q(f["ref"])}{hp} [dir=both, arrowtail={child}, arrowhead={parent}, style={style}, '
            f'color="#444444", label=<<FONT POINT-SIZE="9">{escape(label)}</FONT>>];')


# ============================================================================= Diagram A — presentation
PRES = {
    'g1': ['roles', 'role_permissions', 'permissions', 'users', 'user_profiles', 'auth_sessions'],
    'g2': ['languages', 'artists', 'films', 'albums', 'album_artists', 'songs', 'song_artists', 'genres', 'song_genres'],
    'g3': ['moods', 'contexts', 'intelligence_models', 'audio_features', 'song_moods'],
    'g4': ['listening_sessions', 'listening_history', 'playback_events', 'ratings', 'song_mood_ratings', 'user_likes', 'song_dismissals'],
    'g5': ['recommendation_batches', 'recommendation_batch_moods', 'recommendation_items', 'recommendation_reasons', 'reason_types'],
    'g6': ['playlists', 'playlist_songs', 'user_mood_preferences', 'user_genre_preferences'],
    'g7': ['music_sources', 'song_media', 'source_records', 'pipeline_jobs', 'review_queue'],
    'g8': ['world_archetypes', 'weekly_worlds', 'world_feedback', 'trend_snapshots', 'audit_logs'],
}
# a few descriptive (non-key) attributes per entity, taken from the real columns
PRES_ATTRS = {
    'users': ['username', 'email', 'password_hash', 'is_active'], 'user_profiles': ['display_name', 'content_filter'],
    'roles': ['code'], 'permissions': [], 'auth_sessions': ['token_hash', 'expires_at', 'revoked_at'],
    'languages': ['iso_code', 'name'], 'artists': ['name', 'artist_type'], 'films': ['title', 'release_year'],
    'albums': ['title', 'album_type'], 'songs': ['title', 'isrc', 'duration_sec', 'status'], 'genres': ['name'],
    'song_artists': [], 'song_genres': ['is_primary'], 'album_artists': [],
    'moods': ['name'], 'contexts': ['code', 'name'], 'intelligence_models': ['kind', 'version', 'is_active'],
    'audio_features': ['energy', 'valence', 'tempo_bpm', 'is_current'], 'song_moods': ['confidence'],
    'listening_sessions': ['started_at', 'status'], 'listening_history': ['listened_sec', 'completed', 'skipped'],
    'playback_events': ['event_type', 'position_sec'], 'ratings': ['rating'], 'song_mood_ratings': ['match_percentage'], 'user_likes': ['liked_at'], 'song_dismissals': ['dismissed_at'],
    'recommendation_batches': ['strategy', 'created_at'], 'recommendation_batch_moods': ['weight'],
    'recommendation_items': ['rank_position', 'final_score'], 'recommendation_reasons': ['strength'], 'reason_types': ['template'],
    'playlists': ['name', 'kind'], 'playlist_songs': ['position'], 'user_mood_preferences': ['blended_score'],
    'user_genre_preferences': ['blended_score'],
    'music_sources': ['code', 'rights_scope'], 'song_media': ['media_type', 'availability'], 'source_records': ['external_id', 'status'],
    'pipeline_jobs': ['job_type', 'status', 'idempotency_key'], 'review_queue': ['review_type', 'status'],
    'world_archetypes': ['name'], 'weekly_worlds': ['week_start', 'version', 'status'], 'world_feedback': ['feedback'],
    'trend_snapshots': ['window_code', 'entity_type', 'entity_id'], 'audit_logs': ['action', 'entity_type', 'entity_id'],
}
# relationships shown on the presentation diagram, with a reading label (child → parent FK)
PRES_EDGES = [
    (('users', 'role_id'), 'has role'), (('role_permissions', 'role_id'), 'grants'), (('role_permissions', 'permission_code'), 'granted via'),
    (('user_profiles', 'user_id'), 'profile of'), (('auth_sessions', 'user_id'), 'signs in'),
    (('albums', 'film_id'), 'soundtrack of'), (('album_artists', 'album_id'), 'credits'), (('album_artists', 'artist_id'), 'credited on'),
    (('songs', 'album_id'), 'track on'), (('songs', 'primary_artist_id'), 'primary artist'), (('songs', 'language_id'), 'sung in'),
    (('song_artists', 'song_id'), 'credits'), (('song_artists', 'artist_id'), 'credited on'),
    (('song_genres', 'song_id'), 'classified'), (('song_genres', 'genre_id'), 'genre'), (('genres', 'parent_genre_id'), 'sub-genre of'),
    (('films', 'language_id'), 'language'),
    (('audio_features', 'song_id'), 'analysed'), (('audio_features', 'model_id'), 'produced by'),
    (('song_moods', 'song_id'), 'tagged'), (('song_moods', 'mood_id'), 'mood'), (('song_moods', 'feature_id'), 'derived from'),
    (('listening_sessions', 'user_id'), 'opens'), (('listening_history', 'session_id', 'user_id'), 'contains'),
    (('listening_history', 'song_id'), 'plays'), (('listening_history', 'batch_id'), 'came from'), (('playback_events', 'play_id'), 'events of'),
    (('listening_sessions', 'context_id'), 'context'),
    (('ratings', 'user_id'), 'rates'), (('ratings', 'song_id'), 'rated'), (('song_mood_ratings', 'user_id'), 'rates mood fit'),
    (('song_mood_ratings', 'song_id'), 'mood-rated'), (('song_mood_ratings', 'mood_id'), 'rated mood'), (('user_likes', 'user_id'), 'likes'), (('user_likes', 'song_id'), 'liked'),
    (('song_dismissals', 'user_id'), 'not for me'), (('song_dismissals', 'song_id'), 'dismissed'),
    (('recommendation_batches', 'user_id'), 'receives'), (('recommendation_batches', 'context_id'), 'for context'),
    (('recommendation_batches', 'model_id'), 'scored by'),
    (('recommendation_batch_moods', 'batch_id'), 'asked moods'), (('recommendation_batch_moods', 'mood_id'), 'mood'),
    (('recommendation_items', 'batch_id'), 'ranks'), (('recommendation_items', 'song_id'), 'recommends'),
    (('recommendation_reasons', 'batch_id', 'song_id'), 'explains'), (('recommendation_reasons', 'reason_code'), 'reason type'),
    (('playlists', 'user_id'), 'owns'), (('playlist_songs', 'playlist_id'), 'contains'), (('playlist_songs', 'song_id'), 'listed in'),
    (('user_mood_preferences', 'user_id'), 'learned for'), (('user_mood_preferences', 'mood_id'), 'mood'),
    (('user_genre_preferences', 'user_id'), 'learned for'), (('user_genre_preferences', 'genre_id'), 'genre'),
    (('song_media', 'song_id'), 'playable as'), (('song_media', 'source_id'), 'from source'),
    (('source_records', 'source_id'), 'provides'), (('source_records', 'song_id'), 'provenance of'),
    (('source_records', 'last_job_id'), 'last job'), (('review_queue', 'record_id'), 'reviews'), (('review_queue', 'candidate_song_id'), 'possible duplicate'),
    (('weekly_worlds', 'user_id'), 'world of'), (('weekly_worlds', 'archetype_code'), 'themed by'), (('weekly_worlds', 'batch_id'), 'song list (1:1)'),
    (('world_feedback', 'user_id'), 'gives'), (('world_feedback', 'world_id'), 'feedback on'),
    (('trend_snapshots', 'job_id'), 'computed by'), (('audit_logs', 'actor_user_id'), 'actor'),
]


def pres_node(name, fill, border):
    tb = T[name]
    cols = {c['name']: c for c in tb['columns']}
    fkcols = {c for f in tb['fks'] for c in f['cols']}
    rows = []
    for c in tb['pk']:
        rows.append(('PK' + (' FK' if c in fkcols else ''), c, True))
    for c in [c['name'] for c in tb['columns'] if c['name'] in fkcols and c['name'] not in tb['pk']]:
        rows.append(('FK', c, False))
    for c in PRES_ATTRS.get(name, []):
        if c not in cols:
            sys.exit(f'presentation attribute {name}.{c} does not exist')
        if c not in tb['pk'] and c not in fkcols:
            rows.append(('', c, False))
    out = [f'<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="{border}" BGCOLOR="#FFFFFF">',
           f'<TR><TD COLSPAN="2" BGCOLOR="{fill}" CELLPADDING="6"><FONT POINT-SIZE="13"><B>{name}</B></FONT></TD></TR>']
    for tag, c, bold in rows:
        cc = f'<B>{c}</B>' if bold else c
        out.append(f'<TR><TD ALIGN="LEFT" PORT="L_{c}"><FONT POINT-SIZE="9" COLOR="#555555">{tag or "&#160;"}</FONT></TD>'
                   f'<TD ALIGN="LEFT" PORT="R_{c}"><FONT POINT-SIZE="11">{cc}</FONT></TD></TR>')
    out.append('</TABLE>')
    return f'{q(name)} [shape=plaintext, label=<{"".join(out)}>];'


# ============================================================================= Diagram C — conceptual
CONCEPT_TABLES = [
    ('users', 'g1'), ('moods', 'g3'), ('contexts', 'g3'), ('songs', 'g2'), ('song_moods', 'g3'), ('audio_features', 'g3'),
    ('recommendation_batches', 'g5'), ('recommendation_batch_moods', 'g5'), ('recommendation_items', 'g5'), ('recommendation_reasons', 'g5'),
    ('listening_sessions', 'g4'), ('listening_history', 'g4'), ('user_mood_preferences', 'g6'), ('user_genre_preferences', 'g6'), ('genres', 'g2'),
]
CONCEPT_FKS = [
    ('recommendation_batches', 'user_id'), ('recommendation_batches', 'context_id'), ('recommendation_batch_moods', 'batch_id'),
    ('recommendation_batch_moods', 'mood_id'), ('recommendation_items', 'batch_id'), ('recommendation_items', 'song_id'),
    ('recommendation_reasons', 'batch_id', 'song_id'), ('listening_sessions', 'user_id'), ('listening_history', 'session_id', 'user_id'),
    ('listening_history', 'song_id'), ('listening_history', 'batch_id'), ('user_mood_preferences', 'user_id'), ('user_mood_preferences', 'mood_id'),
    ('user_genre_preferences', 'user_id'), ('user_genre_preferences', 'genre_id'), ('song_moods', 'song_id'), ('song_moods', 'mood_id'),
    ('song_moods', 'feature_id'), ('audio_features', 'song_id'),
]
CONCEPT_STEPS = [
    ('users', 'recommendation_batches', '1  user picks a mood / context → a batch is stored'),
    ('moods', 'recommendation_batch_moods', '2  chosen moods stored with weights'),
    ('recommendation_batches', 'recommendation_items', '3  sp_generate_recommendations ranks songs: mood tags, audio features, preferences'),
    ('recommendation_items', 'listening_history', '4  user plays a song (batch_id links play → list)'),
    ('listening_history', 'user_mood_preferences', '5  sp_refresh_user_preferences learns'),
    ('user_mood_preferences', 'recommendation_items', '6  preferences feed the next ranking'),
]
CONCEPT_DESC = {
    'users': 'the listener', 'moods': 'musical moods (Calm, Energetic …)', 'contexts': 'moments (Study, Workout …)',
    'songs': 'catalogue', 'song_moods': 'mood tags per song + model', 'audio_features': 'energy, valence, tempo …',
    'recommendation_batches': 'one generated list (request)', 'recommendation_batch_moods': 'moods asked for',
    'recommendation_items': 'ranked songs + score breakdown', 'recommendation_reasons': '"Why this song?"',
    'listening_sessions': 'a listening session', 'listening_history': 'each play: listened time, completed, skipped',
    'user_mood_preferences': 'learned mood taste', 'user_genre_preferences': 'learned genre taste', 'genres': 'genres',
}


CONCEPT_POS = {   # hand-placed left-to-right flow (inches): request → list → plays → learning
    'users': (0, 6.2), 'contexts': (0, 3.9), 'moods': (0, 1.4),
    'recommendation_batches': (5.6, 6.2), 'recommendation_batch_moods': (5.6, 3.9), 'song_moods': (5.6, 1.1),
    'recommendation_items': (11.2, 6.2), 'recommendation_reasons': (11.2, 8.6), 'songs': (11.2, 3.6), 'audio_features': (11.2, 1.1),
    'listening_sessions': (16.8, 8.6), 'listening_history': (16.8, 6.2),
    'user_mood_preferences': (22.4, 6.2), 'user_genre_preferences': (22.4, 3.6), 'genres': (22.4, 1.1),
}


def concept_dot():
    groups = {g[0]: g for g in GROUPS}
    s = [f'digraph concept {{ graph [fontname="{FONT}", layout=neato, splines=true, overlap=false, sep="+18", pad=0.3, outputorder=edgesfirst]; '
         f'node [fontname="{FONT}", fontsize=10]; edge [fontname="{FONT}", fontsize=9];']
    for t, g in CONCEPT_TABLES:
        _, _, fill, border, _ = groups[g]
        x, y = CONCEPT_POS[t]
        keys = ', '.join(T[t]['pk'])
        s.append(f' {q(t)} [shape=plaintext, pos="{x},{y}!", label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" COLOR="{border}" BGCOLOR="#FFFFFF">'
                 f'<TR><TD BGCOLOR="{fill}"><FONT POINT-SIZE="14"><B>{t}</B></FONT></TD></TR>'
                 f'<TR><TD><FONT POINT-SIZE="11" COLOR="#333333">{escape(CONCEPT_DESC[t])}</FONT></TD></TR>'
                 f'<TR><TD><FONT POINT-SIZE="9" COLOR="#666666">PK: {escape(keys)}</FONT></TD></TR></TABLE>>];')
    used = []
    for key in CONCEPT_FKS:
        f = fk(*key)
        used.append(f)
        parent, child = ends(f)
        s.append(f' {q(f["table"])} -> {q(f["ref"])} [dir=both, arrowtail={child}, arrowhead={parent}, color="#555555", '
                 f'style={"solid" if f["inPk"] else "dashed"}, label=<<FONT POINT-SIZE="9" COLOR="#555555">{escape(", ".join(f["cols"]))}</FONT>>];')
    for i, (a, b, text) in enumerate(CONCEPT_STEPS, 1):
        s.append(f' {q(a)} -> {q(b)} [color="#2F6FD0", penwidth=3, style="bold", arrowhead=normal, arrowsize=1.2, '
                 f'label=<<TABLE BORDER="0" BGCOLOR="#2F6FD0" CELLPADDING="3"><TR><TD><FONT POINT-SIZE="12" COLOR="#FFFFFF"><B> {i} </B></FONT></TD></TR></TABLE>>];')
    rows = ''.join(f'<TR><TD BGCOLOR="#2F6FD0"><FONT COLOR="#FFFFFF" POINT-SIZE="12"><B>{i}</B></FONT></TD>'
                   f'<TD ALIGN="LEFT"><FONT POINT-SIZE="12">{escape(text.split("  ", 1)[1])}</FONT></TD></TR>'
                   for i, (_, _, text) in enumerate(CONCEPT_STEPS, 1))
    s.append(f' steps [shape=plaintext, pos="16.8,1.8!", label=<<TABLE BORDER="1" COLOR="#2F6FD0" CELLBORDER="0" CELLSPACING="2" CELLPADDING="4" BGCOLOR="#F4F8FE">'
             f'<TR><TD COLSPAN="2" ALIGN="LEFT"><FONT POINT-SIZE="13" COLOR="#1F4F9A"><B>Process steps (blue arrows)</B></FONT></TD></TR>{rows}</TABLE>>];')
    s.append('}')
    return '\n'.join(s), used


def build_concept():
    src, used = concept_dot()
    block = Block(render_svg(src, os.path.join(BUILD, 'MUSE_ERD_Conceptual_body.svg')))
    legend = legend_block(os.path.join(BUILD, '_concept_legend.svg'), process=True)
    compose([[block], [legend]], [], 'MUSE — Conceptual explanation: how a recommendation is made and learned from',
            'CONCEPTUAL VIEW for the presentation: only the entities in this flow are shown. Grey lines are real foreign keys (crow\'s foot).\n'
            'Blue numbered arrows are PROCESS STEPS performed by the API and stored procedures, not relationships. '
            'This is not the complete database ERD (see MUSE_ERD_Full_Schema).',
            os.path.join(OUT, 'MUSE_ERD_Conceptual.svg'), gap=30)
    open(os.path.join(BUILD, 'MUSE_ERD_Conceptual.dot'), 'w').write(src)
    return used


# ============================================================================= grid composition (A and B)
GRID = [['g7', 'g2', 'g3'],
        ['g6', 'g4', 'g5'],
        ['g8', 'g1', 'legend']]
BLOCK_OPTS = {   # per-group Graphviz settings for a compact, landscape-friendly block
    'g1': dict(rankdir='LR'), 'g2': dict(rankdir='LR'), 'g3': dict(rankdir='LR'), 'g4': dict(rankdir='LR'),
    'g5': dict(rankdir='TB'), 'g6': dict(rankdir='LR'), 'g7': dict(rankdir='LR'), 'g8': dict(rankdir='LR'),
}


def block_dot(group, tables, node_lines, intra, opts, wrap=3, compact=False):
    gid, label, fill, border, _ = group
    sep = 'nodesep=0.18, ranksep=0.45' if compact else 'nodesep=0.3, ranksep=0.75'
    s = [f'digraph {gid} {{ graph [fontname="{FONT}", rankdir={opts.get("rankdir", "LR")}, pad=0.05, {sep}, '
         f'splines=true, newrank=true]; node [fontname="{FONT}", fontsize=10]; edge [fontname="{FONT}", fontsize=9];',
         f' subgraph cluster_{gid} {{ label=<<B>{escape(label)}</B>>; labeljust=l; fontsize=18; fontcolor="{border}"; style="filled,rounded"; '
         f'fillcolor="{fill}"; color="{border}"; penwidth=1.4; margin=16;']
    s += ['  ' + l for l in node_lines]
    # tables with no relationship inside the block would all share one rank (a long column);
    # chain them invisibly, `wrap` per rank, so the block stays compact
    linked = {f['table'] for f, _ in intra} | {f['ref'] for f, _ in intra}
    lonely = [t for t in tables if t not in linked]
    for i in range(len(lonely)):
        if i + wrap < len(lonely):
            s.append(f'  {q(lonely[i])} -> {q(lonely[i + wrap])} [style=invis];')
    s.append(' }')
    for f, lab in intra:
        s.append(' ' + edge_dot(f, label=lab))
    s.append('}')
    return '\n'.join(s)


def legend_block(path, process=False):
    src = (f'digraph legend {{ graph [fontname="{FONT}", rankdir=LR, pad=0.05]; node [fontname="{FONT}"]; edge [fontname="{FONT}"];\n'
           + legend_cluster('legend', process) + '\n}')
    return Block(render_svg(src, path))


def build_grid(kind):
    """kind 'presentation' or 'full'."""
    groups = {g[0]: g for g in GROUPS}
    if kind == 'presentation':
        shown = {t for ts in PRES.values() for t in ts}
        edge_list = []
        for key, label in PRES_EDGES:
            f = fk(key[0], *key[1:])
            if f['table'] not in shown or f['ref'] not in shown:
                sys.exit(f'presentation edge {key} points outside the shown entities')
            edge_list.append((f, label))
        members = PRES
        make_node = lambda t, g: pres_node(t, g[2], g[3])
    else:
        shown = set(T)
        edge_list = [(f, None) for f in FKS]
        members = {g[0]: g[4] for g in GROUPS}
        make_node = lambda t, g: node_full(t, g[2], g[3])
    blocks = {}
    for gid, tables in members.items():
        g = groups[gid]
        inside = set(tables)
        intra = [(f, lab) for f, lab in edge_list if f['table'] in inside and f['ref'] in inside]
        src = block_dot(g, tables, [make_node(t, g) for t in tables], intra, BLOCK_OPTS[gid],
                        wrap=2 if kind == 'presentation' else 3, compact=kind == 'presentation')
        blocks[gid] = Block(render_svg(src, os.path.join(BUILD, f'_{kind}_{gid}.svg')))
    blocks['legend'] = legend_block(os.path.join(BUILD, f'_{kind}_legend.svg'))
    inter = []
    for f, lab in edge_list:
        if GROUP_OF[f['table']] == GROUP_OF[f['ref']]:
            continue
        parent, child = ends(f)
        inter.append({'child': f['table'], 'child_col': f['cols'][0], 'parent': f['ref'], 'parent_col': f['refCols'][0],
                      'tail': child, 'head': parent, 'dashed': not f['inPk'], 'label': lab})
    grid = [[blocks[c] for c in row] for row in GRID]
    if kind == 'presentation':
        title = 'MUSE — Music Mood Intelligence & Recommendation Database System · ER Diagram'
        sub = (f'Overview of the major entities ({len(shown)} of {len(T)} tables, {len(edge_list)} relationships) in crow\'s-foot notation. '
               'Every line is a real foreign key. Complete schema: MUSE_ERD_Full_Schema.')
        out = os.path.join(OUT, 'MUSE_ERD_Presentation.svg')
        w, h = compose(grid, inter, title, sub, out, gap=45, margin=24, label_size=12)
    else:
        title = 'MUSE — Complete Database ERD'
        sub = (f'All {len(T)} tables and all {len(FKS)} foreign-key relationships. Key columns only (PK, FK, unique keys); '
               f'every other attribute is in docs/DATA_DICTIONARY.md. {GEN}.')
        out = os.path.join(OUT, 'MUSE_ERD_Full_Schema.svg')
        w, h = compose(grid, inter, title, sub, out, gap=90, label_size=10)
    return out, w, h, edge_list, shown, len(inter), grid


# ============================================================================= Mermaid
def mermaid():
    lines = ['%% MUSE — complete database ERD (Mermaid erDiagram)', f'%% {GEN}',
             '%% Cardinality: ||--o{ one-to-many (FK NOT NULL), |o..o{ (FK nullable), ||--o| one-to-one;',
             '%% "--" identifying (FK is part of the child PK), ".." non-identifying. Only key columns are listed.',
             'erDiagram']
    for gid, label, _, _, tables in GROUPS:
        lines.append(f'  %% ---- {label}')
        for t in tables:
            rows, rest = key_columns(T[t])
            lines.append(f'  {t} {{')
            for col, tags, typ in rows:
                base = typ.split(' · ')[0].replace(',', '_')
                keys = []
                if 'PK' in tags.split():
                    keys.append('PK')
                if 'FK' in tags.split():
                    keys.append('FK')
                if any(x.startswith('U') for x in tags.split()):
                    keys.append('UK')
                note = []
                if ' · null' in typ:
                    note.append('nullable')
                if ' · gen' in typ:
                    note.append('generated')
                lines.append(f'    {base} {col}{(" " + ", ".join(keys)) if keys else ""}{(" " + json.dumps(", ".join(note))) if note else ""}')
            lines.append('  }')
    lines.append('  %% ---- relationships (one line per foreign key)')
    for f in FKS:
        lines.append(f'  {f["ref"]} {mermaid_card(f)} {f["table"]} : "{", ".join(f["cols"])}"')
    return '\n'.join(lines) + '\n'


# ============================================================================= draw.io
def drawio_cells(nodes, clusters, edges, page_name, page_id):
    """nodes: [(table, x, y, w, h)] top-left coords; clusters: [(label, fill, border, x, y, w, h)];
    edges: [(child, parent, tail, head, dashed, label)] — tail/head are crow's-foot kinds or None for process arrows."""
    cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
    nid = 2
    for label, fill, border, x, y, w, h in clusters:
        cells.append(f'<mxCell id="c{nid}" value="{escape(label)}" style="rounded=1;arcSize=2;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={border};'
                     f'verticalAlign=top;align=left;spacingLeft=8;fontStyle=1;fontSize=16;fontColor={border};" vertex="1" parent="1">'
                     f'<mxGeometry x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" as="geometry"/></mxCell>')
        nid += 1
    ids = {}
    for name, x, y, w, h in nodes:
        g = GROUP_OF[name]
        rows, rest = key_columns(T[name])
        body = ''.join(f'<tr><td style="color:#555;font-size:9px;padding-right:6px">{escape(tags)}</td>'
                       f'<td>{"<b>" + escape(c) + "</b>" if c in T[name]["pk"] else escape(c)}</td>'
                       f'<td style="color:#777;font-size:9px;padding-left:6px">{escape(typ)}</td></tr>' for c, tags, typ in rows)
        if rest:
            body += f'<tr><td colspan="3" style="color:#888;font-size:9px"><i>+ {rest} other columns</i></td></tr>'
        value = (f'<div style="background:{g[2]};padding:4px;font-weight:bold;border-bottom:1px solid {g[3]}">{name}</div>'
                 f'<table style="font-size:10px;margin:2px 4px">{body}</table>')
        cid = f'n{nid}'
        nid += 1
        ids[name] = cid
        cells.append(f'<mxCell id="{cid}" value="{html.escape(value, quote=True)}" style="rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;'
                     f'spacing=0;fillColor=#FFFFFF;strokeColor={g[3]};" vertex="1" parent="1">'
                     f'<mxGeometry x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" as="geometry"/></mxCell>')
    arrows = {'teetee': 'ERmandOne', 'teeodot': 'ERzeroToOne', 'crowodot': 'ERzeroToMany'}
    count = 0
    for child, parent, tail, head, dashed, label in edges:
        if tail is None:
            style = 'endArrow=classic;strokeColor=#2F6FD0;strokeWidth=2.5;dashed=1;fontColor=#1F4F9A;fontStyle=1;curved=1;'
        else:
            style = (f'edgeStyle=entityRelationEdgeStyle;startArrow={arrows[tail]};endArrow={arrows[head]};startFill=0;endFill=0;'
                     f'strokeColor=#444444;' + ('dashed=1;' if dashed else ''))
        cells.append(f'<mxCell id="e{nid}" value="{escape(label or "")}" style="{style}html=1;fontSize=9;" edge="1" parent="1" '
                     f'source="{ids[child]}" target="{ids[parent]}"><mxGeometry relative="1" as="geometry"/></mxCell>')
        nid += 1
        count += 1
    xml = (f'<diagram id="{page_id}" name="{escape(page_name)}"><mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" '
           f'tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root>{"".join(cells)}</root></mxGraphModel></diagram>')
    return xml, len(ids), count


def drawio_from_grid(grid, edge_list, page_name, page_id):
    nodes, clusters = [], []
    groups = {g[1]: g for g in GROUPS}
    for row in grid:
        for b in row:
            if not b or not any(t in T for t in b.nodes):
                continue
            tables = [t for t in b.nodes if t in T]
            g = GROUPS[[x[0] for x in GROUPS].index(GROUP_OF[tables[0]][0])]
            clusters.append((g[1], g[2], g[3], b.x, b.y, b.w, b.h))
            for t in tables:
                n = b.nodes[t]
                nodes.append((t, b.x + n['x0'], b.y + n['y0'], n['x1'] - n['x0'], n['y1'] - n['y0']))
    edges = []
    for f, lab in edge_list:
        parent, child = ends(f)
        edges.append((f['table'], f['ref'], child, parent, not f['inPk'], lab))
    return drawio_cells(nodes, clusters, edges, page_name, page_id)


def drawio_from_dot(dot_path, page_name, page_id, fk_edges, steps):
    js = json.loads(subprocess.run(['dot', '-Tjson', dot_path], capture_output=True, text=True, check=True).stdout)
    H = float(js['bb'].split(',')[3])
    nodes = []
    for o in js.get('objects', []):
        if o.get('name') in T and 'pos' in o:
            x, y = map(float, o['pos'].split(','))
            w, h = float(o['width']) * 72, float(o['height']) * 72
            nodes.append((o['name'], x - w / 2, H - y - h / 2, w, h))
    edges = []
    for f in fk_edges:
        parent, child = ends(f)
        edges.append((f['table'], f['ref'], child, parent, not f['inPk'], ', '.join(f['cols'])))
    for a, b, text in steps:
        edges.append((a, b, None, None, True, text))
    return drawio_cells(nodes, [], edges, page_name, page_id)


# ============================================================================= main
def main():
    report = {'schema': {'tables': len(T), 'foreignKeys': len(FKS), 'views': len(MODEL['views']),
                         'migrations': [m['version'] + ' ' + m['name'] for m in MODEL['migrations']]}}
    print('Diagram B (full schema)…')
    _, fw, fh, fused, _, finter, fgrid = build_grid('full')
    group_pages = []
    for g in GROUPS:
        path = os.path.join(BUILD, f'_group_{g[0]}.svg')
        render_svg(group_dot(g), path)
        group_pages.append([g[0], g[1], path])
    print('Diagram A (presentation)…')
    _, pw, ph, pused, shown, pinter, pgrid = build_grid('presentation')
    print('Diagram C (conceptual)…')
    cused = build_concept()
    print('Mermaid…')
    open(os.path.join(OUT, 'MUSE_ERD.mmd'), 'w').write(mermaid())
    print('draw.io…')
    pages, stats = [], {}
    for xml_n_e, name in [(drawio_from_grid(pgrid, pused, 'A · Presentation ERD', 'presentation'), 'A · Presentation ERD'),
                          (drawio_from_grid(fgrid, [(f, None) for f in FKS], 'B · Complete database ERD', 'full'), 'B · Complete database ERD'),
                          (drawio_from_dot(os.path.join(BUILD, 'MUSE_ERD_Conceptual.dot'), 'C · Conceptual explanation', 'conceptual', cused, CONCEPT_STEPS),
                           'C · Conceptual explanation')]:
        xml, n, e = xml_n_e
        pages.append(xml)
        stats[name] = {'entities': n, 'edges': e}
    open(os.path.join(OUT, 'MUSE_ERD_Editable.drawio'), 'w').write(
        f'<mxfile host="app.diagrams.net" type="device" version="24.0.0">{"".join(pages)}</mxfile>')

    used_fks = [f for f, _ in pused]
    report['presentation'] = {
        'entities': len(shown), 'relationships': len(used_fks), 'drawnBetweenGroups': pinter, 'size': [round(pw), round(ph)],
        'omittedTables': sorted(set(T) - shown),
        'omittedRelationshipsBetweenShownTables': sorted(
            f'{f["table"]}({", ".join(f["cols"])}) -> {f["ref"]}' for f in FKS
            if f['table'] in shown and f['ref'] in shown and f not in used_fks),
    }
    report['conceptual'] = {'entities': len(CONCEPT_TABLES), 'foreignKeyRelationships': len(cused), 'processSteps': len(CONCEPT_STEPS)}
    report['full'] = {'entities': len(T), 'relationships': len(fused), 'drawnBetweenGroups': finter, 'groupPages': len(GROUPS),
                      'size': [round(fw), round(fh)]}
    report['drawio'] = stats
    report['notation'] = {
        'oneToOne': sorted(f'{f["table"]}({", ".join(f["cols"])}) -> {f["ref"]}' for f in FKS if f['unique']),
        'selfReferencing': sorted(f'{f["table"]}({", ".join(f["cols"])})' for f in FKS if f['table'] == f['ref']),
        'compositeForeignKeys': sorted(f'{f["table"]}({", ".join(f["cols"])}) -> {f["ref"]}({", ".join(f["refCols"])})' for f in FKS if len(f['cols']) > 1),
        'optionalForeignKeys': sum(1 for f in FKS if f['nullable']),
        'mandatoryForeignKeys': sum(1 for f in FKS if not f['nullable']),
        'identifying': sum(1 for f in FKS if f['inPk']),
        'junctionTables': sorted(t for t, tb in T.items() if len(tb['pk']) >= 2 and sum(1 for f in tb['fks'] if f['inPk']) >= 2),
        'compositePrimaryKeys': sorted(f'{t}({", ".join(tb["pk"])})' for t, tb in T.items() if len(tb['pk']) > 1),
        'tablesWithoutForeignKeys': sorted(t for t, tb in T.items() if not tb['fks'] and not any(f['ref'] == t for f in FKS)),
        'onDelete': {r: sum(1 for f in FKS if f['onDelete'] == r) for r in sorted({f['onDelete'] for f in FKS})},
    }
    json.dump(report, open(os.path.join(OUT, 'validation-report.json'), 'w'), indent=1)
    json.dump({'groups': group_pages}, open(os.path.join(BUILD, 'group-pages.json'), 'w'))
    print(json.dumps({k: report[k] for k in ('schema', 'full', 'presentation', 'conceptual', 'drawio')}, indent=1)[:2500])


if __name__ == '__main__':
    main()
