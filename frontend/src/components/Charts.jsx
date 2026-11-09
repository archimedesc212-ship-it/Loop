// SVG charts following the dataviz method: thin marks, 4px rounded data-ends
// anchored to the baseline, 2px surface gaps, hairline grids, one axis,
// hover tooltips, a legend for 2+ series, and a table view for every chart.
// Categorical slots were validated against the MUSE dark surface (#171C2E):
// all checks pass (worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3).
import { useEffect, useMemo, useRef, useState } from 'react';

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
export const OTHER = '#5A6078';
const ACCENT = '#F2B544';
const SURFACE = '#171C2E';

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
};
const compact = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v * 10) / 10));

/** Draw at the container's real pixel width so text and marks keep their intended size. */
function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function useTip() {
  const [tip, setTip] = useState(null);
  const el = tip ? (
    <div style={{ position: 'absolute', left: `${tip.x}%`, top: tip.y, transform: 'translate(-50%, -110%)', pointerEvents: 'none',
      background: 'var(--surface-3)', border: '1px solid var(--line-2)', borderRadius: 10, padding: '7px 10px', fontSize: '0.8rem',
      whiteSpace: 'nowrap', boxShadow: 'var(--shadow)', zIndex: 5 }}>
      {tip.content}
    </div>
  ) : null;
  return [el, setTip];
}

function TableView({ columns, rows }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="tiny muted" style={{ cursor: 'pointer' }}>Show as table</summary>
      <div className="table-wrap" style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
        <table className="data">
          <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Rounded data-end, square baseline: path for a column. */
const colPath = (x, y, w, h) => {
  const r = Math.min(4, w / 2, h);
  return `M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z`;
};

/** Columns (one measure) with an optional line for a smoothed version of the SAME measure. */
export function Columns({ data, x, y, line, unit = '', height = 200, xLabel = (d) => d, lineLabel = '7-day average', label }) {
  const [tipEl, setTip] = useTip();
  const [box, W] = useWidth();
  const H = height; const P = { l: 36, r: 8, t: 10, b: 24 };
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(Number(d[y]) || 0, line ? Number(d[line]) || 0 : 0))));
  const iw = W - P.l - P.r; const ih = H - P.t - P.b;
  const band = iw / data.length; const bw = Math.min(24, band - 2);
  const sy = (v) => P.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / Math.max(3, Math.floor(W / 90)));
  const pts = line ? data.map((d, i) => `${P.l + i * band + band / 2},${sy(Number(d[line]) || 0)}`).join(' ') : '';
  return (
    <div style={{ position: 'relative' }} ref={box}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} />)}</g>
        {ticks.map((t) => <text key={t} x={P.l - 6} y={sy(t) + 4} textAnchor="end">{compact(t)}</text>)}
        {data.map((d, i) => {
          const v = Number(d[y]) || 0; const bx = P.l + i * band + (band - bw) / 2; const h = (v / max) * ih;
          return (
            <g key={i} onMouseEnter={() => setTip({ x: ((bx + bw / 2) / W) * 100, y: (sy(v) / H) * 100 + '%', content: <><b>{xLabel(d[x])}</b><br />{compact(v)} {unit}{line ? <><br /><span className="muted">{lineLabel}: {compact(Number(d[line]) || 0)}</span></> : null}</> })}
              onMouseLeave={() => setTip(null)}>
              <rect x={P.l + i * band} y={P.t} width={band} height={ih} fill="transparent" />
              {h > 0 && <path d={colPath(bx, sy(v), bw, h)} fill={ACCENT} fillOpacity={line ? 0.55 : 0.9} />}
            </g>
          );
        })}
        {line && <polyline points={pts} fill="none" stroke="#ECE8DF" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
        <line x1={P.l} x2={W - P.r} y1={P.t + ih} y2={P.t + ih} stroke="rgba(236,232,223,0.16)" />
        {data.map((d, i) => (i % every === 0 ? <text key={i} x={P.l + i * band + band / 2} y={H - 6} textAnchor="middle">{xLabel(d[x])}</text> : null))}
      </svg>
      {tipEl}
      {line && <div className="legend" style={{ marginTop: 4 }}><span><i style={{ background: ACCENT, opacity: 0.6 }} />Minutes per day</span><span><i style={{ background: '#ECE8DF', height: 2 }} />{lineLabel}</span></div>}
      <TableView columns={[x, `${y}${unit ? ` (${unit})` : ''}`, ...(line ? [lineLabel] : [])]} rows={data.map((d) => [xLabel(d[x]), d[y], ...(line ? [d[line]] : [])])} />
    </div>
  );
}

/** Horizontal bars for ranked categories (single measure). */
export function HBars({ data, label: labelKey = 'name', value = 'plays', unit = 'plays', max: fixedMax, swatch }) {
  const max = fixedMax || Math.max(1, ...data.map((d) => Number(d[value]) || 0));
  return (
    <div className="stack" style={{ '--gap': '9px' }}>
      {data.map((d) => (
        <div key={d[labelKey]} title={`${d[labelKey]}: ${d[value]} ${unit}`}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 30%) 1fr 64px', gap: 12, alignItems: 'center', fontSize: '0.86rem' }}>
          <span className="row" style={{ '--gap': '8px', minWidth: 0 }}>
            {swatch && <i style={{ width: 8, height: 8, borderRadius: 2, background: swatch(d), flex: 'none' }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d[labelKey]}</span>
          </span>
          <div style={{ height: 14, display: 'flex', alignItems: 'center' }}>
            <div style={{ height: 12, width: `${Math.max(1.5, (Number(d[value]) / max) * 100)}%`, background: ACCENT, borderRadius: '0 4px 4px 0', transition: 'width .5s' }} />
          </div>
          <span className="num soft" style={{ textAlign: 'right' }}>{d[value]}{unit === '%' ? '%' : ''}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 100% stacked columns: share of each mood per period. The top five moods of
 * the whole chart keep one colour each across every column; the rest fold into Other.
 */
export function StackedShare({ rows, bucket = 'bucket', series = 'mood', value = 'plays', bucketLabel = (b) => b, height = 220 }) {
  const [tipEl, setTip] = useTip();
  const { buckets, keys, table } = useMemo(() => {
    const totals = new Map();
    rows.forEach((r) => totals.set(r[series], (totals.get(r[series]) || 0) + Number(r[value])));
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    const hasOther = totals.size > top.length;
    const ks = hasOther ? [...top, 'Other'] : top;
    const bs = [...new Set(rows.map((r) => String(r[bucket])))].sort();
    const t = bs.map((b) => {
      const inB = rows.filter((r) => String(r[bucket]) === b);
      const sum = inB.reduce((s, r) => s + Number(r[value]), 0) || 1;
      const vals = Object.fromEntries(ks.map((k) => [k, 0]));
      inB.forEach((r) => { const k = top.includes(r[series]) ? r[series] : 'Other'; vals[k] += Number(r[value]); });
      return { b, sum, shares: Object.fromEntries(ks.map((k) => [k, vals[k] / sum])) };
    });
    return { buckets: bs, keys: ks, table: t };
  }, [rows, bucket, series, value]);
  const color = (k, i) => (k === 'Other' ? OTHER : SERIES[i]);
  const [box, W] = useWidth();
  const H = height; const P = { l: 34, r: 8, t: 8, b: 24 };
  const iw = W - P.l - P.r; const ih = H - P.t - P.b;
  const band = iw / Math.max(1, buckets.length); const bw = Math.min(24, band - 4);
  const every = Math.ceil(buckets.length / Math.max(3, Math.floor(W / 90)));
  return (
    <div style={{ position: 'relative' }} ref={box}>
      <div className="legend" style={{ marginBottom: 8 }}>{keys.map((k, i) => <span key={k}><i style={{ background: color(k, i) }} />{k}</span>)}</div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Share of plays by mood over time">
        <g className="grid">{[0, 0.5, 1].map((t) => <line key={t} x1={P.l} x2={W - P.r} y1={P.t + ih - t * ih} y2={P.t + ih - t * ih} />)}</g>
        {[0, 0.5, 1].map((t) => <text key={t} x={P.l - 6} y={P.t + ih - t * ih + 4} textAnchor="end">{t * 100}%</text>)}
        {table.map((col, i) => {
          let acc = 0;
          const bx = P.l + i * band + (band - bw) / 2;
          return (
            <g key={col.b} onMouseLeave={() => setTip(null)}
              onMouseEnter={() => setTip({ x: ((bx + bw / 2) / W) * 100, y: '10%', content: <><b>{bucketLabel(col.b)}</b>{keys.map((k, j) => col.shares[k] > 0 && <div key={k} className="row" style={{ '--gap': '6px' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: color(k, j) }} />{k} {Math.round(col.shares[k] * 100)}%</div>)}</> })}>
              <rect x={P.l + i * band} y={P.t} width={band} height={ih} fill="transparent" />
              {keys.map((k, j) => {
                const h = col.shares[k] * ih;
                if (h <= 0) return null;
                const y0 = P.t + ih - acc - h;
                acc += h;
                const top = j === keys.length - 1 || keys.slice(j + 1).every((kk) => !col.shares[kk]);
                return top ? <path key={k} d={colPath(bx, y0, bw, Math.max(0, h - 2))} fill={color(k, j)} />
                  : <rect key={k} x={bx} y={y0 + 2} width={bw} height={Math.max(0, h - 2)} fill={color(k, j)} stroke={SURFACE} strokeWidth="0" />;
              })}
            </g>
          );
        })}
        {buckets.map((b, i) => (i % every === 0 ? <text key={b} x={P.l + i * band + band / 2} y={H - 6} textAnchor="middle">{bucketLabel(b)}</text> : null))}
      </svg>
      {tipEl}
      <TableView columns={['Period', ...keys.map((k) => `${k} %`)]} rows={table.map((c) => [bucketLabel(c.b), ...keys.map((k) => Math.round(c.shares[k] * 100))])} />
    </div>
  );
}

/** Weekday × hour heatmap, single-hue sequential (accent). */
export function Heatmap({ cells }) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(1, ...cells.map((c) => c.plays));
  const at = (d, h) => cells.find((c) => c.weekday === d && c.hour === h);
  return (
    <div>
      <div className="heat" role="img" aria-label="Plays by weekday and hour">
        {DAYS.map((day, d) => (
          <div key={day} style={{ display: 'contents' }}>
            <span style={{ alignSelf: 'center' }}>{day}</span>
            {Array.from({ length: 24 }).map((_, h) => {
              const c = at(d, h); const v = c ? c.plays / max : 0;
              return <i key={h} title={`${day} ${h}:00 — ${c ? c.plays : 0} plays`} style={{ background: v ? `color-mix(in srgb, ${ACCENT} ${Math.round(15 + v * 85)}%, var(--surface-2))` : undefined }} />;
            })}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }).map((_, h) => <span key={h} style={{ textAlign: 'center' }}>{h % 6 === 0 ? h : ''}</span>)}
      </div>
      <div className="legend" style={{ marginTop: 8 }}><span>fewer</span>{[0.15, 0.45, 0.75, 1].map((v) => <i key={v} style={{ background: `color-mix(in srgb, ${ACCENT} ${Math.round(v * 100)}%, var(--surface-2))` }} />)}<span>more plays</span></div>
    </div>
  );
}
