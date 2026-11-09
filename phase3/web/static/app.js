// MUSE Query Studio — front end. Developed by Vaishnav Sai.
/* global window, document, fetch, URL, Blob */
// Live mode: calls the Flask API (server.py). Snapshot mode: window.MUSE_SNAPSHOT holds results saved from MySQL
// by build_offline_html.py; the page then says so and the SQL playground is switched off.
'use strict';
const SNAP = window.MUSE_SNAPSHOT || null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let QUERIES = [];
let current = null;
let lastResult = null;
let gradSeq = 0;

async function api(path, opts) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
const getStatus = () => (SNAP ? Promise.resolve(SNAP.status) : api('api/status'));
const getQueries = () => (SNAP ? Promise.resolve(SNAP.queries) : api('api/queries'));
const runQuery = (id) => (SNAP ? Promise.resolve(SNAP.results[id]) : api(`api/run/${id}`));

// ---------------------------------------------------------------- SQL highlighting (display only)
const KW = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|INNER|LEFT|RIGHT|GROUP|BY|ORDER|HAVING|LIMIT|DESC|ASC|BETWEEN|WITH|RECURSIVE|UNION|ALL|DISTINCT|OVER|PARTITION|CASE|WHEN|THEN|ELSE|END|SEPARATOR|USE|LIKE)\b/g;
const FN = /\b(COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|HOUR|ROW_NUMBER|GROUP_CONCAT|CONCAT)\b(?=\s*\()/g;
function highlight(sql) {
  return sql.split('\n').map((line) => {
    const ci = line.indexOf('--');
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const cm = ci >= 0 ? `<span class="cm">${esc(line.slice(ci))}</span>` : '';
    const parts = code.split(/('(?:[^'\\]|\\.)*')/);
    return parts.map((p, i) => (i % 2 ? `<span class="str">${esc(p)}</span>`
      : esc(p).replace(FN, '<span class="fn">$1</span>').replace(KW, '<span class="kw">$1</span>')
        .replace(/(^|[^\w.#])(\d+(?:\.\d+)?)(?![\w])/g, '$1<span class="num">$2</span>'))).join('') + cm;
  }).join('\n');
}

// ---------------------------------------------------------------- tables
function fmt(v) {
  if (v === null || v === undefined) return { t: 'NULL', c: 'null' };
  if (typeof v === 'number') return { t: Number.isInteger(v) ? (Math.abs(v) >= 10000 ? v.toLocaleString('en-IN') : String(v)) : String(+v.toFixed(3)), c: 'n' };
  return { t: String(v), c: '' };
}
function table(res) {
  if (!res.rows.length) return '<div class="empty">No rows.</div>';
  const head = res.columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const body = res.rows.map((r) => '<tr>' + r.map((v) => { const f = fmt(v); return `<td class="${f.c}" title="${esc(f.t)}">${esc(f.t)}</td>`; }).join('') + '</tr>').join('');
  return `<div class="tablewrap"><table class="res"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function toCSV(res) {
  const q = (v) => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [res.columns.map(q).join(','), ...res.rows.map((r) => r.map(q).join(','))].join('\r\n');
}

// ---------------------------------------------------------------- charts (plain SVG, no library)
function barChart(res, x, y) {
  const xi = res.columns.indexOf(x), yi = res.columns.indexOf(y);
  if (xi < 0 || yi < 0 || !res.rows.length) return '';
  const rows = [...res.rows].filter((r) => r[yi] !== null).sort((a, b) => b[yi] - a[yi]);
  const max = Math.max(...rows.map((r) => r[yi])) || 1;
  const gid = `g${++gradSeq}`;   // unique per chart: a gradient inside a hidden tab would not render
  const W = 640, L = 170, R = 60, bh = 22, gap = 7, H = rows.length * (bh + gap) + 30;
  const bars = rows.map((r, i) => {
    const w = ((W - L - R) * r[yi]) / max, yy = 8 + i * (bh + gap);
    const lab = String(r[xi]).length > 24 ? String(r[xi]).slice(0, 23) + '…' : String(r[xi]);
    return `<text x="${L - 8}" y="${yy + bh * 0.7}" text-anchor="end">${esc(lab)}</text>`
      + `<rect x="${L}" y="${yy}" width="${Math.max(1, w).toFixed(1)}" height="${bh}" rx="4" fill="url(#${gid})"><title>${esc(r[xi])}: ${r[yi]}</title></rect>`
      + `<text x="${L + w + 6}" y="${yy + bh * 0.7}">${fmt(r[yi]).t}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(y)} by ${esc(x)}"><defs><linearGradient id="${gid}" x1="0" x2="1">`
    + `<stop offset="0" stop-color="#8f6bff"/><stop offset="1" stop-color="#c89bff"/></linearGradient></defs>${bars}`
    + `<text x="${L}" y="${H - 4}">${esc(y.replace(/_/g, ' '))}</text></svg>`;
}
function lineChart(res, x, y) {
  const xi = res.columns.indexOf(x), yi = res.columns.indexOf(y);
  if (xi < 0 || yi < 0 || !res.rows.length) return '';
  const W = 640, H = 260, L = 46, B = 34, T = 12, Rr = 12;
  const max = Math.max(...res.rows.map((r) => r[yi])) || 1, n = res.rows.length;
  const px = (i) => L + ((W - L - Rr) * i) / Math.max(1, n - 1), py = (v) => T + (H - T - B) * (1 - v / max);
  const pts = res.rows.map((r, i) => `${px(i).toFixed(1)},${py(r[yi]).toFixed(1)}`).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${L}" x2="${W - Rr}" y1="${py(max * f)}" y2="${py(max * f)}" stroke="#2e2a45"/>`
    + `<text x="${L - 6}" y="${py(max * f) + 4}" text-anchor="end">${Math.round(max * f)}</text>`).join('');
  const xl = res.rows.map((r, i) => `<text x="${px(i)}" y="${H - B + 16}" text-anchor="middle">${esc(r[xi])}</text>`).join('');
  const dots = res.rows.map((r, i) => `<circle cx="${px(i)}" cy="${py(r[yi])}" r="3.5" fill="#c89bff"><title>${esc(r[xi])}: ${r[yi]}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(y)} by ${esc(x)}">${grid}<polyline points="${pts}" fill="none" stroke="#c89bff" stroke-width="2.5"/>${dots}${xl}`
    + `<text x="${(W + L) / 2}" y="${H - 2}" text-anchor="middle">${esc(x.replace(/_/g, ' '))}</text></svg>`;
}
function chart(res, spec) {
  if (!spec || !spec.kind) return '';
  return spec.kind === 'line' ? lineChart(res, spec.x, spec.y) : barChart(res, spec.x, spec.y);
}
function scatter(rows) {
  const W = 640, H = 320, L = 40, B = 30, T = 10, R = 10;
  const px = (v) => L + (W - L - R) * v, py = (v) => T + (H - T - B) * (1 - v);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${px(f)}" x2="${px(f)}" y1="${T}" y2="${H - B}" stroke="#2e2a45"/><line x1="${L}" x2="${W - R}" y1="${py(f)}" y2="${py(f)}" stroke="#2e2a45"/>`
    + `<text x="${px(f)}" y="${H - 12}" text-anchor="middle">${f}</text><text x="${L - 6}" y="${py(f) + 4}" text-anchor="end">${f}</text>`).join('');
  const dots = rows.map((r) => `<circle cx="${px(r.energy).toFixed(1)}" cy="${py(r.valence).toFixed(1)}" r="6" fill="#c89bff" fill-opacity=".8"><title>${esc(r.title)} — ${esc(r.artist)} (confidence ${r.confidence})</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Energy and valence of the songs">${grid}${dots}</svg>`;
}

// ---------------------------------------------------------------- tabs and sidebar
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function renderList(filter = '') {
  const f = filter.toLowerCase();
  $('#qlist').innerHTML = QUERIES.filter((q) => !f || `${q.id} ${q.title} ${q.concepts.join(' ')}`.toLowerCase().includes(f))
    .map((q) => `<li><button data-id="${q.id}" class="${current && current.id === q.id ? 'active' : ''}"><span class="qid">${q.id}</span><span>${esc(q.title)}</span></button></li>`).join('');
  document.querySelectorAll('#qlist button').forEach((b) => b.addEventListener('click', () => { selectQuery(b.dataset.id); showTab('lib'); }));
}
$('#qsearch').addEventListener('input', (e) => renderList(e.target.value));

function selectQuery(id) {
  current = QUERIES.find((q) => q.id === id);
  renderList($('#qsearch').value);
  $('#q-question').textContent = `${current.id} · ${current.question}`;
  $('#q-chips').innerHTML = current.concepts.map((c) => `<span class="chip">${esc(c)}</span>`).join('');
  $('#q-sql').innerHTML = highlight(current.sql);
  $('#q-out').innerHTML = ''; $('#q-meta').textContent = ''; $('#q-csv').hidden = true;
  runCurrent();
}
async function runCurrent() {
  const q = current;
  $('#q-run').disabled = true; $('#q-meta').textContent = 'Running…';
  try {
    const res = await runQuery(q.id);
    lastResult = res;
    $('#q-meta').textContent = `${res.rows.length} row${res.rows.length === 1 ? '' : 's'} · ${res.ms} ms${SNAP ? ' (when the snapshot was taken)' : ''}${res.truncated ? ' · first 5,000 rows' : ''}`;
    $('#q-out').innerHTML = table(res) + `<div class="chart">${chart(res, q.chart)}</div>`;
    $('#q-csv').hidden = false;
  } catch (e) {
    $('#q-meta').textContent = '';
    $('#q-out').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally { $('#q-run').disabled = false; }
}
$('#q-run').addEventListener('click', runCurrent);
$('#q-csv').addEventListener('click', () => {
  if (!lastResult) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + toCSV(lastResult)], { type: 'text/csv' }));
  a.download = `muse_${current.id}.csv`; a.click(); URL.revokeObjectURL(a.href);
});

// ---------------------------------------------------------------- dashboard
async function dashboard() {
  const byId = Object.fromEntries(QUERIES.map((q) => [q.id, q]));
  try {
    const [k, hours, moods, ctx, fav] = await Promise.all(['Q03', 'Q13', 'Q07', 'Q11', 'Q16'].map(runQuery));
    const r = Object.fromEntries(k.columns.map((c, i) => [c, k.rows[0][i]]));
    const items = [['Plays', r.total_plays.toLocaleString('en-IN')], ['Listeners', r.listeners], ['Hours listened', r.hours_listened],
      ['Avg completion', `${r.avg_completion_pct}%`], ['Songs played', r.distinct_songs]];
    $('#kpis').innerHTML = items.map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${esc(v)}</div></div>`).join('');
    $('#kpinote').textContent = `From Q03 · plays between ${String(r.first_play).slice(0, 10)} and ${String(r.last_play).slice(0, 10)}`;
    $('#c-hours').innerHTML = chart(hours, byId.Q13.chart);
    $('#c-moods').innerHTML = chart(moods, byId.Q07.chart);
    $('#c-context').innerHTML = chart(ctx, byId.Q11.chart);
    $('#t-fav').innerHTML = table(fav);
  } catch (e) {
    $('#kpis').innerHTML = `<div class="err" style="grid-column:1/-1">${esc(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------- mood explorer
async function moodInit() {
  const lists = SNAP ? SNAP.moodLists : await api('api/moods');
  $('#m-mood').innerHTML = lists.moods.map((m) => `<option ${m === 'Calm' ? 'selected' : ''}>${esc(m)}</option>`).join('');
  $('#m-lang').innerHTML = ['Any', ...lists.languages].map((l) => `<option>${esc(l)}</option>`).join('');
  ['#m-mood', '#m-lang', '#m-conf'].forEach((s) => $(s).addEventListener('input', moodRun));
  moodRun();
}
async function moodRun() {
  const mood = $('#m-mood').value, lang = $('#m-lang').value, min = +$('#m-conf').value;
  $('#m-confv').textContent = min.toFixed(2);
  try {
    let res;
    if (SNAP) {   // same query, filtered in the browser over the saved rows of the active mood model
      const d = SNAP.moodRows, ci = (c) => d.columns.indexOf(c);
      const rows = d.rows.filter((r) => r[ci('mood')] === mood && r[ci('confidence')] >= min && (lang === 'Any' || r[ci('language')] === lang))
        .map((r) => d.columns.filter((c) => c !== 'mood').map((c) => r[ci(c)]));
      res = { columns: d.columns.filter((c) => c !== 'mood'), rows, ms: null, sql: SNAP.moodSql, params: [mood, min, lang, lang] };
    } else {
      res = await api(`api/mood?mood=${encodeURIComponent(mood)}&min=${min}&lang=${encodeURIComponent(lang)}`);
    }
    $('#m-sql').innerHTML = highlight(res.sql);
    $('#m-meta').textContent = `Values sent separately (parameterised query): ${JSON.stringify(res.params)} · ${res.rows.length} rows${res.ms != null ? ` · ${res.ms} ms` : ''}`;
    $('#m-out').innerHTML = res.rows.length ? table(res) : '<div class="warnbox">No song is tagged with this mood at this confidence. Lower the slider or choose another language.</div>';
    const objs = res.rows.map((r) => Object.fromEntries(res.columns.map((c, i) => [c, r[i]])));
    $('#m-scatter').innerHTML = scatter(objs);
  } catch (e) {
    $('#m-out').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------- playground
$('#p-run').addEventListener('click', async () => {
  $('#p-run').disabled = true; $('#p-meta').textContent = 'Running…'; $('#p-out').innerHTML = '';
  try {
    const res = await api('api/sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: $('#p-sql').value }) });
    $('#p-meta').textContent = `${res.rows.length} rows · ${res.ms} ms`;
    $('#p-out').innerHTML = table(res);
  } catch (e) {
    $('#p-meta').textContent = '';
    $('#p-out').innerHTML = `<div class="${/Only SELECT|one statement|not allowed/.test(e.message) ? 'warnbox' : 'err'}">${esc(e.message)}</div>`;
  } finally { $('#p-run').disabled = false; }
});

// ---------------------------------------------------------------- start
(async function start() {
  try {
    const s = await getStatus();
    if (!s.connected) throw new Error(s.error || 'not connected');
    $('#status').className = SNAP ? 'status snap' : 'status ok';
    $('#status').innerHTML = SNAP
      ? `Offline snapshot · MySQL ${esc(s.version)}<small>Saved ${esc(SNAP.created)} from <code>${esc(s.database)}</code></small>`
      : `Connected · MySQL ${esc(s.version)}<small>Database <code>${esc(s.database)}</code> · ${s.tables} tables · user <code>${esc(s.user)}</code></small>`;
    if (s.credit) $('#credit').textContent = s.credit;
  } catch (e) {
    $('#status').className = 'status bad';
    $('#status').innerHTML = `Not connected<small>${esc(e.message)}. Load schema.sql in MySQL and check phase3/app/.env, then restart server.py.</small>`;
    return;
  }
  if (SNAP) {
    const b = $('#snapbanner');
    b.hidden = false;
    b.textContent = `Offline snapshot: these are real results saved from MySQL on ${SNAP.created}. To run queries live, start server.py. The SQL playground needs the live server.`;
    $('#p-run').disabled = true;
    $('#p-meta').textContent = 'Needs the live server (python server.py).';
  }
  QUERIES = await getQueries();
  renderList();
  selectQuery(QUERIES[0].id);
  showTab('dash');
  dashboard();
  moodInit();
})();
