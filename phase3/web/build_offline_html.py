"""Builds MUSE_Query_Studio_offline.html: one self-contained HTML file (CSS, JavaScript and data inlined)
that opens without a server. It runs every Phase 3 query on MySQL now and stores the real results in the page,
which labels them as a snapshot with the time they were taken. The SQL playground stays switched off offline.

  python build_offline_html.py      (needs the same MUSE_DB_* settings as server.py)
Developed by Vaishnav Sai.
"""
import datetime
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server as S  # noqa: E402

M = S.M
OUT = HERE / 'MUSE_Query_Studio_offline.html'


def main():
    with S.app.test_client() as c:
        status = c.get('/api/status').get_json()
        if not status.get('connected'):
            sys.exit(f'not connected: {status.get("error")}')
        queries = c.get('/api/queries').get_json()
        results = {}
        for q in queries:
            r = c.get(f'/api/run/{q["id"]}')
            if r.status_code != 200:
                sys.exit(f'{q["id"]} failed: {r.get_json()}')
            results[q['id']] = r.get_json()
        mood_lists = c.get('/api/moods').get_json()
    # every active-model mood tag, so the mood explorer filters can work offline over the real rows
    all_rows_sql = S.MOOD_SQL.replace('SELECT s.title,', 'SELECT m.name AS mood, s.title,').split('WHERE')[0] + 'ORDER BY sm.confidence DESC, s.popularity DESC'
    df, _, _ = M.run(all_rows_sql)
    mood_rows = S.result(df, 0, False)
    snap = {'created': datetime.datetime.now().strftime('%d %b %Y, %H:%M'), 'status': status, 'queries': queries, 'results': results,
            'moodLists': mood_lists, 'moodRows': {'columns': mood_rows['columns'], 'rows': mood_rows['rows']},
            'moodSql': S.MOOD_SQL.replace('%s', '?') + ';'}
    html = (HERE / 'static' / 'index.html').read_text(encoding='utf-8')
    css = (HERE / 'static' / 'style.css').read_text(encoding='utf-8')
    js = (HERE / 'static' / 'app.js').read_text(encoding='utf-8')
    data = json.dumps(snap, ensure_ascii=False).replace('</', '<\\/')
    html = html.replace('<link rel="stylesheet" href="static/style.css">', f'<style>\n{css}\n</style>')
    html = html.replace('<!--SNAPSHOT-->', f'<script>window.MUSE_SNAPSHOT = {data};</script>')
    html = html.replace('<script src="static/app.js"></script>', f'<script>\n{js}\n</script>')
    OUT.write_text(html, encoding='utf-8')
    print(f'{OUT.name}: {len(queries)} queries, {len(mood_rows["rows"])} mood rows, {OUT.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
