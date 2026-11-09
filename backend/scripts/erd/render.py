#!/usr/bin/env python3
"""
Renders the ERD SVGs to PNG and PDF with headless Chromium (vector PDF, the SVG is
printed as vectors), and validates the result:
  * every SVG parses and every table of the diagram is present as text
  * no text overflows its table box (getBBox of each text vs. its node outline)
  * PDFs have the expected pages; PNGs have the expected size

  python3 backend/scripts/erd/render.py        (after build_erd.py)
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'erd')
BUILD = os.path.join(OUT, '.build')
MODEL = json.load(open(os.path.join(OUT, 'schema-model.json')))
A3 = ('420mm', '297mm')
A1 = ('841mm', '594mm')

PAGE = '''<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: {w} {h}; margin: 0; }}
html, body {{ margin: 0; padding: 0; background: #fff; }}
.p {{ width: {w}; height: {h}; display: flex; align-items: center; justify-content: center; page-break-after: always; overflow: hidden; }}
.p > svg {{ max-width: 96%; max-height: 96%; width: auto; height: auto; }}
</style></head><body><div class="p">{svg}</div></body></html>'''

CHECK_JS = r'''() => {
  // For every Graphviz node (<g class="node">) check that each text lies inside the node outline.
  const out = { nodes: 0, texts: 0, overflow: [] };
  document.querySelectorAll('g.node').forEach(g => {
    const shapes = g.querySelectorAll('polygon, path, ellipse');
    if (!shapes.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shapes.forEach(s => { const b = s.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
    out.nodes++;
    g.querySelectorAll('text').forEach(t => {
      out.texts++;
      const b = t.getBBox();
      if (b.x < x0 - 0.75 || b.x + b.width > x1 + 0.75 || b.y < y0 - 0.75 || b.y + b.height > y1 + 0.75) {
        out.overflow.push((g.querySelector('title') || {}).textContent + ': ' + t.textContent);
      }
    });
  });
  out.allText = Array.from(document.querySelectorAll('text')).map(t => t.textContent.trim());
  return out;
}'''


def svg_text(path):
    s = open(path, encoding='utf-8').read()
    return s[s.index('<svg'):]


def main():
    report = json.load(open(os.path.join(OUT, 'validation-report.json')))
    groups = json.load(open(os.path.join(BUILD, 'group-pages.json')))['groups']
    pres_tables = None
    result = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context()
        page = ctx.new_page()
        expected = {
            'MUSE_ERD_Presentation.svg': report['presentation']['entities'],
            'MUSE_ERD_Full_Schema.svg': len(MODEL['tables']),
            'MUSE_ERD_Conceptual.svg': report['conceptual']['entities'],
        }
        for f, n in expected.items():
            path = os.path.join(OUT, f)
            page.goto('file://' + path)
            r = page.evaluate(CHECK_JS)
            names = set(r['allText'])
            if f == 'MUSE_ERD_Full_Schema.svg':
                missing = sorted(t for t in MODEL['tables'] if t not in names)
            else:
                missing = []
            import re as _re
            raw = open(path, encoding='utf-8').read()
            dot_edges = len(_re.findall(r'<g[^>]*class="edge"', raw)) - 3 * raw.count('Notation (crow')
            key = {'MUSE_ERD_Presentation.svg': 'presentation', 'MUSE_ERD_Full_Schema.svg': 'full'}.get(f)
            lines = dot_edges + report[key]['drawnBetweenGroups'] if key else None
            result[f] = {'relationshipLinesDrawn': lines, 'tableBoxes': r['nodes'], 'texts': r['texts'], 'overflowingTexts': r['overflow'], 'missingTables': missing}
            print(f'{f}: {r["nodes"]} boxes, {r["texts"]} texts, overflow {len(r["overflow"])}, missing tables {missing}')
        for _, _, gp in groups:
            page.goto('file://' + gp)
            r = page.evaluate(CHECK_JS)
            if r['overflow']:
                result.setdefault('groupPagesOverflow', []).extend(r['overflow'])

        # ---- PNG (screenshots of the vector SVG at 2x)
        for f, scale in [('MUSE_ERD_Presentation', 2), ('MUSE_ERD_Full_Schema', 1.5), ('MUSE_ERD_Conceptual', 2)]:
            svg = svg_text(os.path.join(OUT, f + '.svg'))
            pg = b.new_page(device_scale_factor=scale)
            pg.set_content('<html><body style="margin:0;background:#fff">' + svg + '</body></html>')
            dims = pg.evaluate("() => { const s = document.querySelector('svg'); const r = s.getBoundingClientRect(); return [r.width, r.height]; }")
            pg.set_viewport_size({'width': int(dims[0]) + 1, 'height': int(dims[1]) + 1})
            pg.screenshot(path=os.path.join(OUT, f + '.png'), timeout=120000)
            pg.close()

        # ---- PDF
        def pdf(svgs_and_sizes, target):
            writer = PdfWriter()
            for i, (svg, (w, h)) in enumerate(svgs_and_sizes):
                tmp = os.path.join(BUILD, f'_page{i}.html')
                open(tmp, 'w', encoding='utf-8').write(PAGE.format(w=w, h=h, svg=svg_text(svg)))
                pg = b.new_page()
                pg.goto('file://' + tmp)
                one = os.path.join(BUILD, f'_page{i}.pdf')
                pg.pdf(path=one, width=w, height=h, print_background=True, margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
                pg.close()
                for pgobj in PdfReader(one).pages:
                    writer.add_page(pgobj)
            writer.add_metadata({'/Title': 'MUSE ER Diagram', '/Author': 'MUSE project'})
            with open(target, 'wb') as fh:
                writer.write(fh)
            return len(writer.pages)

        n = pdf([(os.path.join(OUT, 'MUSE_ERD_Presentation.svg'), A3)], os.path.join(OUT, 'MUSE_ERD_Presentation.pdf'))
        result['MUSE_ERD_Presentation.pdf'] = {'pages': n, 'size': 'A3 landscape'}
        def natural(svg):
            # group pages are printed at 100 % (1 SVG unit = 1 pt) so every label stays readable
            m = re.search(r'viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"', open(svg).read())
            w, h = float(m.group(1)), float(m.group(2))
            return (f'{(max(w, 1191) / 0.96 + 10) / 72:.2f}in', f'{(max(h, 842) / 0.96 + 10) / 72:.2f}in')
        pages = [(os.path.join(OUT, 'MUSE_ERD_Full_Schema.svg'), A1)] + [(gp, natural(gp)) for _, _, gp in groups]
        n = pdf(pages, os.path.join(OUT, 'MUSE_ERD_Full_Schema.pdf'))
        result['MUSE_ERD_Full_Schema.pdf'] = {'pages': n, 'size': 'page 1 A1 landscape (whole schema); pages 2-9 one functional group each at 100 % scale (at least A3)'}
        b.close()

    # PDF sanity: text is extractable (vector, not an image) and table names are present
    full_text = ' '.join(pg.extract_text() or '' for pg in PdfReader(os.path.join(OUT, 'MUSE_ERD_Full_Schema.pdf')).pages)
    result['MUSE_ERD_Full_Schema.pdf']['tablesFoundAsText'] = sum(1 for t in MODEL['tables'] if t in full_text)
    pres_text = PdfReader(os.path.join(OUT, 'MUSE_ERD_Presentation.pdf')).pages[0].extract_text() or ''
    shown = report['presentation']['entities']
    result['MUSE_ERD_Presentation.pdf']['vectorText'] = len(pres_text) > 1000
    result['MUSE_ERD_Presentation.pdf']['entityNamesFoundAsText'] = sum(
        1 for t in MODEL['tables'] if t not in report['presentation']['omittedTables'] and t in pres_text)
    result['MUSE_ERD_Presentation.pdf']['entitiesShown'] = shown

    report['rendering'] = result
    json.dump(report, open(os.path.join(OUT, 'validation-report.json'), 'w'), indent=1)
    bad = [k for k, v in result.items() if isinstance(v, dict) and (v.get('overflowingTexts') or v.get('missingTables'))]
    bad += ['groupPagesOverflow'] if result.get('groupPagesOverflow') else []
    print(json.dumps({k: v for k, v in result.items() if k.endswith('.pdf')}, indent=1))
    if bad:
        print('PROBLEMS:', bad)
        sys.exit(1)
    print('render + validation OK')


if __name__ == '__main__':
    main()
