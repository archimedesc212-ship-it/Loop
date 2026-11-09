#!/usr/bin/env python3
"""Compares the hand-written Mermaid ER diagrams in docs/DATABASE_DESIGN.md with the
real foreign keys and records every difference in docs/erd/validation-report.json."""
import json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'erd')
m = json.load(open(os.path.join(OUT, 'schema-model.json')))
fks = [f for t in m['tables'].values() for f in t['fks']]
doc = open(os.path.join(ROOT, 'docs', 'DATABASE_DESIGN.md')).read()
rel = re.findall(r'^\s+([A-Za-z_]+)\s+(\|\||\|o|\}o|\}\|)(--|\.\.)(o\{|\|\{|\|\||o\|)\s+([A-Za-z_]+)\s*:', doc, re.M)
out = []
for parent, left, line, right, child in rel:
    p, c = parent.lower(), child.lower()
    cand = [f for f in fks if f['table'] == c and f['ref'] == p]
    if not cand:
        out.append({'doc': f'{parent} {left}{line}{right} {child}', 'issue': 'no foreign key from ' + c + ' to ' + p})
        continue
    f = cand[0]
    want_left = '|o' if f['nullable'] else '||'
    want_right = 'o|' if f['unique'] else 'o{'
    notes = []
    if left != want_left:
        notes.append(f'parent end drawn {left}, database enforces {want_left}')
    if right != want_right:
        notes.append(f'child end drawn {right}, database enforces {want_right} '
                     '(a minimum of one child, or a mandatory 1:1, is not enforced by a foreign key)')
    if notes:
        out.append({'doc': f'{parent} {left}{line}{right} {child}', 'issue': '; '.join(notes)})
r = json.load(open(os.path.join(OUT, 'validation-report.json')))
r['existingDocDiagram'] = {'relationshipsChecked': len(rel), 'differences': out}
json.dump(r, open(os.path.join(OUT, 'validation-report.json'), 'w'), indent=1)
print(len(rel), 'checked'); [print(' -', d['doc'], '→', d['issue']) for d in out]
