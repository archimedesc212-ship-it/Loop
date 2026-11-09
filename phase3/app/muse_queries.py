"""Shared code for the MUSE Query Studio (Streamlit) and the command-line runner.

Reads the queries and their headers from database/phase3/MUSE_Phase3_Queries.sql and runs them on MySQL.
Connection settings come from environment variables or a local .env file (never from the code):
  MUSE_DB_HOST, MUSE_DB_PORT, MUSE_DB_USER, MUSE_DB_PASSWORD, MUSE_DB_NAME (default muse_db)
Developed by Vaishnav Sai.
"""
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
import pymysql

APP_DIR = Path(__file__).resolve().parent
QUERY_FILE = Path(os.environ.get('MUSE_QUERY_FILE', (APP_DIR.parent.parent / 'database' / 'phase3' / 'MUSE_Phase3_Queries.sql') if (APP_DIR.parent.parent / 'database').exists() else APP_DIR.parent / 'MUSE_Phase3_Queries.sql'))
CREDIT = 'Developed by Vaishnav Sai'


@dataclass
class Query:
    id: str
    title: str
    concepts: list
    question: str
    sql: str
    chart: dict = field(default_factory=dict)


def load_env():
    """Read KEY=VALUE lines from app/.env into os.environ (existing variables win)."""
    env = APP_DIR / '.env'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def settings():
    load_env()
    return {
        'host': os.environ.get('MUSE_DB_HOST', '127.0.0.1'),
        'port': int(os.environ.get('MUSE_DB_PORT', '3306')),
        'user': os.environ.get('MUSE_DB_USER', 'muse_reader'),
        'password': os.environ.get('MUSE_DB_PASSWORD', ''),
        'database': os.environ.get('MUSE_DB_NAME', 'muse_db'),
    }


def connect():
    s = settings()
    return pymysql.connect(host=s['host'], port=s['port'], user=s['user'], password=s['password'], database=s['database'],
                           charset='utf8mb4', connect_timeout=5, read_timeout=30, autocommit=True)


def parse_queries(text=None):
    """Split the SQL file into Query objects using the -- @id / @title / @concepts / @question / @chart headers."""
    text = text if text is not None else QUERY_FILE.read_text(encoding='utf-8')
    out = []
    for block in re.split(r'(?m)^(?=-- @id )', text)[1:]:
        meta, sql_lines = {}, []
        for line in block.splitlines():
            m = re.match(r'^-- @(\w+)\s+(.*)$', line)
            if m and not sql_lines:
                meta[m.group(1)] = m.group(2).strip()
            elif not line.startswith('--'):
                sql_lines.append(line)
        sql = '\n'.join(sql_lines).strip()
        chart = {}
        if 'chart' in meta:
            kind, *pairs = meta['chart'].split()
            chart = {'kind': kind, **dict(p.split('=', 1) for p in pairs)}
        out.append(Query(meta['id'], meta['title'], [c.strip() for c in meta['concepts'].split(',')],
                         meta['question'], sql.rstrip(';').strip(), chart))
    return out


READ_ONLY = re.compile(r'^\s*(SELECT|WITH)\b', re.I)
FORBIDDEN = re.compile(r'\b(INTO\s+(OUTFILE|DUMPFILE)|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|SLEEP\s*\(|BENCHMARK\s*\()', re.I)


def check_read_only(sql):
    """Allow exactly one SELECT / WITH statement. The statement also runs inside START TRANSACTION READ ONLY."""
    body = sql.strip().rstrip(';').strip()
    if not READ_ONLY.match(body):
        raise ValueError('Only SELECT (or WITH … SELECT) queries can be run here.')
    if ';' in re.sub(r"'(?:[^'\\]|\\.)*'", "''", body):
        raise ValueError('Run one statement at a time.')
    if FORBIDDEN.search(body):
        raise ValueError('This kind of SELECT is not allowed here (it writes files, locks rows or delays the server).')
    return body


def run(sql, params=None, max_rows=5000, conn=None):
    """Run one read-only statement. Returns (DataFrame, milliseconds, truncated?)."""
    body = check_read_only(sql)
    own = conn is None
    conn = conn or connect()
    try:
        with conn.cursor() as cur:
            cur.execute('START TRANSACTION READ ONLY')
            t0 = time.perf_counter()
            cur.execute(body, params)
            rows = cur.fetchmany(max_rows + 1)
            ms = (time.perf_counter() - t0) * 1000
            cols = [d[0] for d in cur.description] if cur.description else []
            cur.execute('ROLLBACK')
        truncated = len(rows) > max_rows
        df = pd.DataFrame(list(rows[:max_rows]), columns=cols)
        for c in df.columns:  # DECIMAL -> float so charts and number formats work
            if df[c].map(lambda v: v.__class__.__name__ == 'Decimal').any():
                df[c] = pd.to_numeric(df[c])
                if (df[c].dropna() % 1 == 0).all():  # SUM of whole numbers comes back as DECIMAL
                    df[c] = df[c].astype('Int64')
        return df, ms, truncated
    finally:
        if own:
            conn.close()
