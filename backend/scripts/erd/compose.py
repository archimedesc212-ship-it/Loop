"""
Grid compositor for the MUSE ERDs.

Graphviz lays out each functional group on its own (tables + the relationships
inside the group). The groups are then placed on a fixed landscape grid and the
relationships BETWEEN groups are drawn here as curves with crow's-foot ends, so
the diagram reads left-to-right instead of as one tall column.

Every inter-group curve is drawn from a real foreign key passed in by the caller.
"""
import re
import subprocess
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

NS = {'s': 'http://www.w3.org/2000/svg'}
ET.register_namespace('', 'http://www.w3.org/2000/svg')
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')


def render_svg(dot_src, path):
    open(path + '.dot', 'w').write(dot_src)
    r = subprocess.run(['dot', '-Tsvg', path + '.dot', '-o', path], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f'dot failed for {path}: {r.stderr}')
    return path


class Block:
    """One rendered group (a Graphviz SVG) and the geometry of its tables and rows."""

    def __init__(self, svg_path):
        self.tree = ET.parse(svg_path)
        root = self.tree.getroot()
        vb = [float(v) for v in root.get('viewBox').split()]
        self.w, self.h = vb[2], vb[3]
        g0 = root.find('s:g', NS)
        m = re.search(r'translate\(([-\d.]+)[ ,]([-\d.]+)\)', g0.get('transform'))
        tx, ty = float(m.group(1)), float(m.group(2))
        self.nodes = {}
        for g in g0.iter('{http://www.w3.org/2000/svg}g'):
            if g.get('class') != 'node':
                continue
            name = g.find('s:title', NS).text
            xs, ys = [], []
            for p in g.iter('{http://www.w3.org/2000/svg}polygon'):
                for pt in p.get('points').split():
                    x, y = pt.split(',')
                    xs.append(float(x) + tx)
                    ys.append(float(y) + ty)
            rows = {}
            for t in g.iter('{http://www.w3.org/2000/svg}text'):
                if t.text:
                    rows.setdefault(t.text.strip(), float(t.get('y')) + ty - 3.5)
            if not xs:
                continue
            self.nodes[name] = {'x0': min(xs), 'x1': max(xs), 'y0': min(ys), 'y1': max(ys), 'rows': rows}
        self.root = root
        self.x = self.y = 0

    def anchor(self, table, col, side):
        n = self.nodes[table]
        y = n['rows'].get(col, (n['y0'] + n['y1']) / 2)
        if col is None:
            y = (n['y0'] + n['y1']) / 2
        x = n['x0'] if side < 0 else n['x1']
        return self.x + x, self.y + y

    def center_x(self, table):
        n = self.nodes[table]
        return self.x + (n['x0'] + n['x1']) / 2

    def inner_svg(self, layer='all'):
        """layer 'bg': the group's coloured frame only; 'fg': tables and in-group lines only."""
        r = self.root
        g0 = r.find('s:g', NS)
        keep = []
        for ch in g0:
            cls = ch.get('class')
            is_bg = ch.tag.endswith('polygon') or cls == 'cluster'
            if layer == 'all' or (layer == 'bg' and is_bg) or (layer == 'fg' and cls in ('node', 'edge')):
                keep.append(ET.tostring(ch, encoding='unicode'))
        body = f'<g transform="{g0.get("transform")}">{"".join(keep)}</g>'
        return (f'<svg x="{self.x:.1f}" y="{self.y:.1f}" width="{self.w:.1f}" height="{self.h:.1f}" '
                f'viewBox="0 0 {self.w:.2f} {self.h:.2f}" overflow="visible">{body}</svg>')


def glyph(px, py, d, kind):
    """Crow's-foot end at point (px, py) on a node side; d = +1 (line leaves to the right) or -1."""
    s = []
    line = lambda x1, y1, x2, y2: s.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
    circle = lambda cx: s.append(f'<circle cx="{cx:.1f}" cy="{py:.1f}" r="4" fill="#FFFFFF"/>')
    if kind == 'crowodot':            # zero or many
        for dy in (-6, 0, 6):
            line(px + d * 12, py, px, py + dy)
        circle(px + d * 18)
    elif kind == 'teetee':             # exactly one
        line(px + d * 7, py - 6, px + d * 7, py + 6)
        line(px + d * 12, py - 6, px + d * 12, py + 6)
    elif kind == 'teeodot':            # zero or one
        line(px + d * 7, py - 6, px + d * 7, py + 6)
        circle(px + d * 15)
    return ''.join(s)


def compose(blocks_grid, edges, title, subtitle, out_path, gap=60, margin=40, label_size=11, edge_color='#3A3A3A'):
    """
    blocks_grid: list of rows, each a list of Block or None.
    edges: dicts {child, child_col, parent, parent_col, tail, head, dashed, label}
           (tail = crow's-foot kind at the child end, head = at the parent end)
    """
    ncols = max(len(r) for r in blocks_grid)
    col_w = [max((r[c].w for r in blocks_grid if c < len(r) and r[c]), default=0) for c in range(ncols)]
    row_h = [max((b.h for b in r if b), default=0) for r in blocks_grid]
    sub_lines = subtitle.split('\n')
    title_h = 70 + 20 * len(sub_lines)
    total_w = margin * 2 + sum(col_w) + gap * (ncols - 1)
    total_h = margin * 2 + title_h + sum(row_h) + gap * (len(row_h) - 1)
    y = margin + title_h
    where = {}
    for ri, r in enumerate(blocks_grid):
        x = margin
        for ci in range(ncols):
            b = r[ci] if ci < len(r) else None
            if b:
                b.x = x + (col_w[ci] - b.w) / 2
                b.y = y + (row_h[ri] - b.h) / 2
                for t in b.nodes:
                    where[t] = b
            x += col_w[ci] + gap
        y += row_h[ri] + gap

    curves, glyphs, labels = [], [], []
    for e in edges:
        cb, pb = where.get(e['child']), where.get(e['parent'])
        if cb is None or pb is None:
            raise SystemExit(f'edge {e["child"]} -> {e["parent"]}: table not placed')
        cx, px = cb.center_x(e['child']), pb.center_x(e['parent'])
        if abs(cx - px) < 40:           # stacked vertically: leave and enter on the same side
            sc = sp = 1 if cx > total_w / 2 else -1
        else:
            sc = 1 if px > cx else -1
            sp = -sc
        x1, y1 = cb.anchor(e['child'], e['child_col'], sc)
        x2, y2 = pb.anchor(e['parent'], e['parent_col'], sp)
        bend = max(60, min(260, abs(x2 - x1) * 0.45))
        if sc == sp:
            bend = max(bend, 90 + abs(y2 - y1) * 0.12)
        c1 = (x1 + sc * bend, y1)
        c2 = (x2 + sp * bend, y2)
        dash = ' stroke-dasharray="6 4"' if e.get('dashed') else ''
        curves.append(f'<path d="M{x1:.1f},{y1:.1f} C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {x2:.1f},{y2:.1f}"{dash}/>')
        glyphs.append(glyph(x1, y1, sc, e['tail']))
        glyphs.append(glyph(x2, y2, sp, e['head']))
        if e.get('label'):
            # a point on the cubic; start at t = 0.5 and slide along the curve until the
            # label no longer sits on top of a table box
            def at(t):
                u = 1 - t
                return (u ** 3 * x1 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * x2,
                        u ** 3 * y1 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * y2)
            half = len(e['label']) * label_size * 0.3
            def clear(px, py):
                for b in set(where.values()):
                    for n in b.nodes.values():
                        if (px + half > b.x + n['x0'] - 4 and px - half < b.x + n['x1'] + 4
                                and py + 6 > b.y + n['y0'] - 4 and py - 10 < b.y + n['y1'] + 4):
                            return False
                return True
            mx, my = at(0.5)
            for t in sorted((i / 40 for i in range(4, 37)), key=lambda v: abs(v - 0.5)):
                if clear(*at(t)):
                    mx, my = at(t)
                    break
            labels.append(f'<text x="{mx:.1f}" y="{my + 4:.1f}" text-anchor="middle">{escape(e["label"])}</text>')

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{total_w:.0f}" height="{total_h:.0f}" '
        f'viewBox="0 0 {total_w:.0f} {total_h:.0f}" font-family="Arial, Helvetica, sans-serif">',
        f'<title>{escape(title)}</title>',
        f'<rect x="0" y="0" width="{total_w:.0f}" height="{total_h:.0f}" fill="#FFFFFF"/>',
        f'<text x="{margin}" y="{margin + 30}" font-size="32" font-weight="bold" fill="#1A1A1A">{escape(title)}</text>',
        ''.join(f'<text x="{margin}" y="{margin + 58 + 20 * i}" font-size="14" fill="#555555">{escape(line)}</text>' for i, line in enumerate(sub_lines)),
    ]
    # layers: group frames → relationships between groups → tables → crow's-foot ends → labels,
    # so a line crossing another group runs under its tables instead of over their text
    blocks = [b for r in blocks_grid for b in r if b]
    parts += [b.inner_svg('bg') for b in blocks]
    parts.append(f'<g fill="none" stroke="{edge_color}" stroke-width="1.3" stroke-linecap="round">{"".join(curves)}</g>')
    parts += [b.inner_svg('fg') for b in blocks]
    parts.append(f'<g stroke="{edge_color}" stroke-width="1.3" fill="none">{"".join(glyphs)}</g>')
    parts.append(f'<g font-size="{label_size}" fill="#222222" stroke="#FFFFFF" stroke-width="3.5" paint-order="stroke" '
                 f'stroke-linejoin="round">{"".join(labels)}</g>')
    parts.append('</svg>')
    open(out_path, 'w').write('\n'.join(parts))
    return total_w, total_h
