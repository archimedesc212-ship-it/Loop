"""MUSE Query Studio — HTML/CSS/JavaScript interface served by a small Flask API.

  pip install -r requirements.txt
  (connection settings: phase3/app/.env or MUSE_DB_* environment variables, see phase3/app/.env.example)
  python server.py            -> open http://127.0.0.1:5000

The browser never talks to MySQL directly: it calls the JSON endpoints below, which run the queries from
database/phase3/MUSE_Phase3_Queries.sql through the same read-only code as the Streamlit app and the CLI.
Developed by Vaishnav Sai.
"""
import datetime
import decimal
import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'app'))
import muse_queries as M  # noqa: E402

app = Flask(__name__, static_folder=None)
QUERIES = M.parse_queries()
BY_ID = {q.id: q for q in QUERIES}

MOOD_SQL = '''SELECT s.title, a.name AS artist, COALESCE(l.name, '—') AS language, sm.confidence,
       f.energy, f.valence, f.tempo_bpm, s.popularity
FROM song_moods sm
INNER JOIN moods m                ON m.mood_id = sm.mood_id
INNER JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1
INNER JOIN songs s                ON s.song_id = sm.song_id
INNER JOIN artists a              ON a.artist_id = s.primary_artist_id
INNER JOIN audio_features f       ON f.feature_id = sm.feature_id
LEFT JOIN languages l             ON l.language_id = s.language_id
WHERE m.name = %s AND sm.confidence >= %s AND (%s = 'Any' OR l.name = %s)
ORDER BY sm.confidence DESC, s.popularity DESC'''


def plain(v):
    if v is None:
        return None
    if isinstance(v, float) and v != v:          # NaN from pandas means SQL NULL
        return None
    if isinstance(v, (datetime.date, datetime.datetime, datetime.time)) or hasattr(v, 'isoformat'):
        return str(v)
    if isinstance(v, decimal.Decimal):
        return float(v)
    if hasattr(v, 'item'):                       # numpy / pandas scalars
        v = v.item()
        return None if isinstance(v, float) and v != v else v
    if v.__class__.__name__ == 'NAType':
        return None
    return v


def result(df, ms, truncated):
    return {'columns': list(df.columns), 'rows': [[plain(v) for v in r] for r in df.itertuples(index=False)],
            'ms': round(ms, 2), 'truncated': truncated}


def fail(e, status=400):
    """Return the real error to the page; never hide it."""
    if isinstance(e, M.pymysql.MySQLError):
        code = e.args[0] if e.args else ''
        msg = e.args[1] if len(e.args) > 1 else str(e)
        return jsonify({'error': f'MySQL error {code}: {msg}'}), status
    return jsonify({'error': str(e)}), status


@app.get('/')
def index():
    return send_from_directory(HERE / 'static', 'index.html')


@app.get('/static/<path:name>')
def static_file(name):
    return send_from_directory(HERE / 'static', name)


@app.get('/api/status')
def status():
    try:
        df, _, _ = M.run("SELECT VERSION() AS version, DATABASE() AS db, (SELECT COUNT(*) FROM information_schema.TABLES "
                         "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE') AS tables_count")
        r = df.iloc[0]
        return jsonify({'connected': True, 'version': str(r.version).split('-')[0], 'database': r.db,
                        'tables': int(r.tables_count), 'user': M.settings()['user'], 'queries': len(QUERIES), 'credit': M.CREDIT})
    except Exception as e:  # report the real reason
        return jsonify({'connected': False, 'error': str(e), 'credit': M.CREDIT}), 503


@app.get('/api/queries')
def queries():
    return jsonify([{'id': q.id, 'title': q.title, 'concepts': q.concepts, 'question': q.question, 'sql': q.sql + ';',
                     'chart': q.chart} for q in QUERIES])


@app.get('/api/run/<qid>')
def run_query(qid):
    q = BY_ID.get(qid.upper())
    if not q:
        return jsonify({'error': f'No query {qid}'}), 404
    try:
        return jsonify(result(*M.run(q.sql)))
    except Exception as e:
        return fail(e, 500)


@app.get('/api/moods')
def moods():
    try:
        m = M.run('SELECT name FROM moods ORDER BY name')[0]['name'].tolist()
        lang = M.run('SELECT name FROM languages ORDER BY name')[0]['name'].tolist()
        return jsonify({'moods': m, 'languages': lang})
    except Exception as e:
        return fail(e, 500)


@app.get('/api/mood')
def mood():
    name = request.args.get('mood', 'Calm')
    lang = request.args.get('lang', 'Any')
    try:
        conf = min(1.0, max(0.0, float(request.args.get('min', '0.6'))))
    except ValueError:
        return jsonify({'error': 'min must be a number between 0 and 1'}), 400
    try:
        out = result(*M.run(MOOD_SQL, (name, conf, lang, lang)))
        out['sql'] = MOOD_SQL.replace('%s', '?') + ';'
        out['params'] = [name, conf, lang, lang]
        return jsonify(out)
    except Exception as e:
        return fail(e, 500)


@app.post('/api/sql')
def sql():
    text = (request.get_json(silent=True) or {}).get('sql', '')
    if len(text) > 10000:
        return jsonify({'error': 'Query is too long (10,000 characters at most).'}), 400
    try:
        return jsonify(result(*M.run(text)))
    except ValueError as e:          # rejected by the read-only guard
        return fail(e, 400)
    except M.pymysql.MySQLError as e:
        return fail(e, 400)


if __name__ == '__main__':
    host = os.environ.get('MUSE_WEB_HOST', '127.0.0.1')   # local only by default
    port = int(os.environ.get('MUSE_WEB_PORT', '5000'))
    print(f'MUSE Query Studio on http://{host}:{port}  ({M.CREDIT})')
    app.run(host=host, port=port, debug=False)
