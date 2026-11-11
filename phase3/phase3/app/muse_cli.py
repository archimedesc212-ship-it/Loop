"""MUSE query runner for the terminal.

  python muse_cli.py list            list the queries
  python muse_cli.py run Q05         run one query and print the result
  python muse_cli.py run all         run every query
  python muse_cli.py sql "SELECT …"  run your own read-only SELECT

Uses the same queries and connection settings as the Streamlit app. Developed by Vaishnav Sai.
"""
import sys
import textwrap

import pandas as pd

import muse_queries as M


def show(q, conn):
    print(f'\n=== {q.id} · {q.title} ===')
    print(textwrap.fill(q.question, 100))
    print('Concepts: ' + ', '.join(q.concepts))
    print(textwrap.indent(q.sql + ';', '    '))
    df, ms, _ = M.run(q.sql, conn=conn)
    with pd.option_context('display.max_rows', 60, 'display.max_columns', 20, 'display.width', 160, 'display.max_colwidth', 45):
        print(df.to_string(index=False) if not df.empty else '(no rows)')
    print(f'-- {len(df)} rows in {ms:.1f} ms')


def main(argv):
    queries = M.parse_queries()
    if len(argv) < 2 or argv[1] in ('-h', '--help'):
        print(__doc__)
        return 0
    if argv[1] == 'list':
        for q in queries:
            print(f'{q.id}  {q.title:<45} {", ".join(q.concepts)}')
        return 0
    conn = M.connect()
    try:
        if argv[1] == 'run' and len(argv) > 2:
            wanted = queries if argv[2].lower() == 'all' else [q for q in queries if q.id.lower() == argv[2].lower()]
            if not wanted:
                print(f'No query {argv[2]}. Use "list" to see the ids.')
                return 1
            for q in wanted:
                show(q, conn)
        elif argv[1] == 'sql' and len(argv) > 2:
            df, ms, _ = M.run(' '.join(argv[2:]), conn=conn)
            print(df.to_string(index=False) if not df.empty else '(no rows)')
            print(f'-- {len(df)} rows in {ms:.1f} ms')
        else:
            print(__doc__)
            return 1
    finally:
        conn.close()
    print(f'\n{M.CREDIT}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv))
    except ValueError as e:
        print(f'Not run: {e}')
        sys.exit(2)
    except M.pymysql.MySQLError as e:
        print(f'MySQL error: {e}')
        sys.exit(1)
