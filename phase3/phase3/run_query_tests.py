"""Runs every Phase 3 query through the same code the Streamlit app uses and records the real results.

Checks for each query: it runs without error, returns at least one row, and its column names are unique.
Also checks that the query file covers every concept the brief asks for, and that the read-only guard
rejects writes. Output: docs/phase3/.build/query-results.json. Exit code 1 if anything fails.

  python3 phase3/run_query_tests.py          (uses MUSE_DB_* from phase3/app/.env or the environment)
Developed by Vaishnav Sai.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'app'))
import muse_queries as M  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'docs' / 'phase3' / '.build'
REQUIRED = {
    'SELECT': r'\bSELECT\b', 'WHERE': r'\bWHERE\b', 'SUM': r'\bSUM\s*\(', 'AVG': r'\bAVG\s*\(', 'COUNT': r'\bCOUNT\s*\(',
    'MIN': r'\bMIN\s*\(', 'MAX': r'\bMAX\s*\(', 'GROUP BY': r'\bGROUP\s+BY\b', 'HAVING': r'\bHAVING\b', 'ORDER BY': r'\bORDER\s+BY\b',
    'INNER JOIN': r'\bINNER\s+JOIN\b', 'LEFT JOIN': r'\bLEFT\s+JOIN\b', 'RIGHT JOIN': r'\bRIGHT\s+JOIN\b',
    'Subquery': r'\(\s*SELECT\b', 'CTE (WITH)': r'^\s*WITH\b', 'Window function': r'\bOVER\s*\(',
}


def plain(v):
    if v is None or (isinstance(v, float) and v != v):
        return None
    if hasattr(v, 'isoformat'):
        return str(v)
    if hasattr(v, 'item'):
        return v.item()
    return v


def main():
    queries = M.parse_queries()
    conn = M.connect()
    res = {'server': M.run('SELECT VERSION() AS v', conn=conn)[0]['v'].iloc[0], 'user': M.settings()['user'],
           'database': M.settings()['database'], 'queries': [], 'coverage': {}, 'guard': []}
    failures = []
    for q in queries:
        try:
            df, ms, _ = M.run(q.sql, conn=conn)
            ok = len(df) > 0 and len(set(df.columns)) == len(df.columns)
            if not ok:
                failures.append(f'{q.id}: no rows or duplicate columns')
            res['queries'].append({'id': q.id, 'title': q.title, 'question': q.question, 'concepts': q.concepts, 'sql': q.sql,
                                   'rows': len(df), 'ms': round(ms, 2), 'columns': list(df.columns), 'ok': ok,
                                   'sample': [[plain(v) for v in r] for r in df.head(12).itertuples(index=False)]})
        except Exception as e:  # record the real error
            failures.append(f'{q.id}: {e}')
            res['queries'].append({'id': q.id, 'title': q.title, 'ok': False, 'error': str(e)})
    for name, pat in REQUIRED.items():
        ids = [q.id for q in queries if re.search(pat, q.sql, re.I | re.M)]
        res['coverage'][name] = ids
        if not ids and name in ('SELECT', 'WHERE', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'GROUP BY', 'HAVING', 'ORDER BY',
                                'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN'):
            failures.append(f'concept not covered: {name}')
    for bad in ['DELETE FROM songs WHERE song_id = 1', 'SELECT 1; DROP TABLE songs', 'UPDATE songs SET popularity = 0',
                "SELECT * FROM songs INTO OUTFILE '/tmp/x.csv'"]:
        try:
            M.run(bad, conn=conn)
            res['guard'].append({'sql': bad, 'blocked': False})
            failures.append(f'guard let through: {bad}')
        except (ValueError, M.pymysql.MySQLError) as e:
            res['guard'].append({'sql': bad, 'blocked': True, 'message': str(e)})
    conn.close()
    res['failures'] = failures
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'query-results.json').write_text(json.dumps(res, indent=1, default=str), encoding='utf-8')
    for q in res['queries']:
        print(f"{q['id']}  {'ok ' if q['ok'] else 'FAIL'} {q.get('rows', '-'):>4} rows  {q.get('ms', 0):>6} ms  {q['title']}")
    print('coverage:', ', '.join(f'{k}: {len(v)}' for k, v in res['coverage'].items()))
    print('read-only guard: ' + ', '.join('blocked' if g['blocked'] else 'NOT BLOCKED' for g in res['guard']))
    if failures:
        print('FAILURES:', *failures, sep='\n  ')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
