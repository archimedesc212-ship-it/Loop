// Checks docs/roadmap/feature-registry.json against the real project, then writes docs/roadmap/FEATURE_REGISTRY.md.
// Nothing in the registry may point at something that does not exist:
//   - reused tables must exist in the live schema model (docs/erd/schema-model.json)
//   - reused views / routines must be defined in database/*.sql or database/migrations/NNNN_*.sql
//   - NEW tables / columns / views / routines must be defined in a file in database/migrations/proposed/
//     (the one named in newDb.migration when given) and must NOT already exist (no duplicate tables)
//   - reused API routes must exist in backend/src/routes/index.js
//   - reused UI files must exist
//   - "existing" tests must be real test names in backend/tests or frontend test files
//   - VERIFIED needs at least one existing test; PROVIDER/PLATFORM features cannot be VERIFIED or IMPLEMENTED
//   - with --results <file> (written by collect-test-results.js), every test cited by a VERIFIED feature
//     must have PASSED in that run — a test that exists but fails cannot verify anything
//   - every feature 33–87 that is not BLOCKED has a full design (API, security, proposed tests)
//   - dependsOn ids exist; the dependency map is generated from dependsOn + shared new tables
// Exit code 1 on any problem.
//
//   node backend/scripts/roadmap/check-registry.js
// Developed by Vaishnav Sai.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const REG = JSON.parse(rd('docs/roadmap/feature-registry.json'));
const SCHEMA = JSON.parse(rd('docs/erd/schema-model.json')).tables;
const PROPOSED_FILES = fs.readdirSync(path.join(ROOT, 'database/migrations/proposed')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
  .map((f) => `database/migrations/proposed/${f}`);
const PROPOSED_BY_FILE = Object.fromEntries(PROPOSED_FILES.map((f) => [f, rd(f)]));
const PROPOSED = Object.values(PROPOSED_BY_FILE).join('\n');
const N = 87;
const resultsArg = process.argv.indexOf('--results');
const RESULTS = resultsArg > 0 ? JSON.parse(fs.readFileSync(path.resolve(process.argv[resultsArg + 1]), 'utf8')) : null;
const PASSED = RESULTS ? new Set(RESULTS.passed) : null;
const ROUTES = rd('backend/src/routes/index.js');
const sqlFiles = [...fs.readdirSync(path.join(ROOT, 'database')).filter((f) => /^\d\d_.*\.sql$/.test(f)).map((f) => `database/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'database/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).map((f) => `database/migrations/${f}`)];
const EXISTING_SQL = sqlFiles.map(rd).join('\n');

// routes: router.get('/x' …) and A.get('/x' …) mounted under /admin
const routes = new Set();
for (const m of ROUTES.matchAll(/\b(router|A)\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
  routes.add(`${m[2].toUpperCase()} ${m[1] === 'A' ? '/admin' : ''}${m[3]}`);
}
// test names
const testNames = new Set();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() && d.name !== 'node_modules'
  ? walk(path.join(dir, d.name)) : /\.test\.(js|jsx)$/.test(d.name) ? [path.join(dir, d.name)] : []));
for (const f of [...walk(path.join(ROOT, 'backend/tests')), ...walk(path.join(ROOT, 'frontend/src'))]) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) testNames.add(m[2].replace(/\\(['"`])/g, '$1'));
}
const defined = (kind, name, src) => new RegExp(`\\b${kind}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+|OR\\s+REPLACE\\s+)?(?:\\w+\\s+)*?\`?${name}\`?\\b`, 'i').test(src)
  || new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:ALGORITHM\\s*=\\s*\\w+\\s+)?(?:DEFINER\\s*=\\s*\\S+\\s+)?(?:SQL\\s+SECURITY\\s+\\w+\\s+)?${kind}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?\`?${name}\`?\\b`, 'i').test(src);
const routineDefined = (name, src) => defined('FUNCTION', name, src) || defined('PROCEDURE', name, src);

const problems = [];
const bad = (f, msg) => problems.push(`#${f.id} ${f.name}: ${msg}`);
const ids = REG.features.map((f) => f.id);
if (ids.length !== N || new Set(ids).size !== N || Math.min(...ids) !== 1 || Math.max(...ids) !== N) problems.push(`ids must be exactly 1..${N} (got ${ids.length})`);
const newTableOwner = {};
for (const f of REG.features) for (const t of f.newDb?.tables || []) newTableOwner[t] = f.id;
const tableKnown = (t) => !!SCHEMA[t] || defined('TABLE', t, PROPOSED);
// a column added by a helper call (mig_NNNN_add_column('t', 'c', …)), by ALTER … ADD/MODIFY COLUMN, or an ENUM value appended
const columnAdded = (t, col, src) => new RegExp(`mig_\\d{4}_add_column\\('${t}',\\s*'${col}'`).test(src)
  || new RegExp(`(ADD|MODIFY)\\s+COLUMN\\s+\`?${col}\\b`, 'i').test(src);
const enumExtended = (t, col, src) => new RegExp(`mig_\\d{4}_append_enum\\('${t}',\\s*'${col}'`).test(src)
  || new RegExp(`MODIFY\\s+COLUMN\\s+\`?${col}\\b`, 'i').test(src);
const phaseIds = new Set(REG.phases.map((p) => p.id));
for (const p of REG.phases.filter((x) => x.features)) for (const id of p.features) {
  const f = REG.features.find((x) => x.id === id);
  if (!f || f.phase !== p.id) problems.push(`phase ${p.id} lists #${id}, but that feature is in ${f ? f.phase : 'nowhere'}`);
}
for (const f of REG.features) {
  if (!REG.statusDefinitions[f.status]) bad(f, `unknown status ${f.status}`);
  if (!REG.dependencyDefinitions[f.dependency]) bad(f, `unknown dependency ${f.dependency}`);
  if (!phaseIds.has(f.phase)) bad(f, `unknown phase ${f.phase}`);
  const r = f.reuse || {};
  for (const t of r.tables || []) {
    if (!SCHEMA[t] && !(f.id >= 33 && defined('TABLE', t, PROPOSED) && newTableOwner[t])) bad(f, `reused table ${t} does not exist`);
  }
  for (const v of r.views || []) if (!defined('VIEW', v, EXISTING_SQL)) bad(f, `reused view ${v} is not defined`);
  for (const p of r.routines || []) if (!routineDefined(p, EXISTING_SQL)) bad(f, `reused routine ${p} is not defined`);
  for (const a of r.api || []) if (!routes.has(a)) bad(f, `reused API ${a} does not exist`);
  for (const u of r.ui || []) if (!fs.existsSync(path.join(ROOT, u))) bad(f, `UI file ${u} does not exist`);
  const n = f.newDb || {};
  if (n.migration && !PROPOSED_BY_FILE[n.migration]) bad(f, `newDb.migration ${n.migration} does not exist`);
  const SRC = n.migration && PROPOSED_BY_FILE[n.migration] ? PROPOSED_BY_FILE[n.migration] : PROPOSED;
  for (const t of n.tables || []) {
    if (SCHEMA[t]) bad(f, `new table ${t} already exists (duplicate)`);
    if (!defined('TABLE', t, SRC)) bad(f, `new table ${t} is not in ${n.migration || 'a proposed migration'}`);
  }
  for (const c of n.columns || []) {
    const [t, col] = c.split('.');
    if (!tableKnown(t)) bad(f, `new column on unknown table ${t}`);
    const exists = SCHEMA[t] && SCHEMA[t].columns.some((x) => x.name === col);
    if (exists && !enumExtended(t, col, SRC)) bad(f, `column ${c} already exists and is not extended by the migration`);
    if (!exists && !columnAdded(t, col, SRC)) bad(f, `column ${c} is not added by ${n.migration || 'a proposed migration'}`);
  }
  for (const v of n.views || []) if (!defined('VIEW', v, SRC)) bad(f, `new view ${v} is not in the proposed migration`);
  for (const p of n.routines || []) if (!routineDefined(p, SRC) && !routineDefined(p, EXISTING_SQL)) bad(f, `routine ${p} is defined nowhere`);
  for (const d of f.dependsOn || []) if (!ids.includes(d) || d === f.id) bad(f, `dependsOn #${d} is not another feature`);
  for (const t of (f.tests && f.tests.existing) || []) if (!testNames.has(t)) bad(f, `existing test not found: "${t}"`);
  if (f.status === 'VERIFIED' && !((f.tests && f.tests.existing) || []).length) bad(f, 'VERIFIED without an existing test');
  if (PASSED && f.status === 'VERIFIED') for (const t of f.tests.existing) if (!PASSED.has(t)) bad(f, `VERIFIED but this test did not pass in the supplied run: "${t}"`);
  if (['PROVIDER', 'PLATFORM'].includes(f.dependency) && ['VERIFIED', 'IMPLEMENTED-UNVERIFIED'].includes(f.status)) bad(f, `${f.dependency}-dependent feature cannot be ${f.status}`);
  if (f.status === 'BLOCKED' && !(f.outstanding || []).length) bad(f, 'BLOCKED without stating what blocks it');
  if (f.id >= 33 && !['BLOCKED', 'VERIFIED'].includes(f.status)) {
    if (!(f.newDb && f.newDb.why)) bad(f, 'database impact not explained (newDb.why)');
    if (['PLANNED', 'PARTIAL'].includes(f.status)) {
      if (!(f.api || []).length) bad(f, 'no API defined');
      if (!(f.security || []).length) bad(f, 'no security/privacy requirements');
      if (!((f.tests && f.tests.proposed) || []).length) bad(f, 'no proposed tests');
    }
  }
}

if (problems.length) {
  console.log(`Registry check FAILED (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
  return;
}

// ---------------------------------------------------------------- markdown
const count = (arr, k) => arr.reduce((m, f) => ((m[f[k]] = (m[f[k]] || 0) + 1), m), {});
const order = ['VERIFIED', 'IMPLEMENTED-UNVERIFIED', 'PARTIAL', 'PLANNED', 'BLOCKED', 'NOT IMPLEMENTED'];
const statusLine = (arr) => order.filter((s) => count(arr, 'status')[s]).map((s) => `${s} ${count(arr, 'status')[s]}`).join(' · ');
const list = (a) => (a && a.length ? a.map((x) => `\`${x}\``).join(', ') : '—');
// dependency map: explicit dependsOn + "uses a table that another feature creates"
const deps = {};
for (const f of REG.features) {
  const set = new Set(f.dependsOn || []);
  for (const t of [...(f.reuse?.tables || []), ...(f.newDb?.columns || []).map((c) => c.split('.')[0])]) if (newTableOwner[t] && newTableOwner[t] !== f.id) set.add(newTableOwner[t]);
  deps[f.id] = [...set].sort((a, b) => a - b);
}
const byId = Object.fromEntries(REG.features.map((f) => [f.id, f]));
const range = (a, b) => REG.features.filter((f) => f.id >= a && f.id <= b);
const md = [`# ${REG.title}`, '', `${REG.credit}. Generated from \`feature-registry.json\` by \`backend/scripts/roadmap/check-registry.js\`, which checks every reference against the code${PASSED ? ` and every VERIFIED status against the test run of ${RESULTS.when.slice(0, 10)} (${RESULTS.backend.counts.passed} backend + ${RESULTS.frontend.counts.passed} frontend passing tests)` : ''}.`, '',
  `**All ${N}:** ${statusLine(REG.features)}`, '', `**Original 1–32:** ${statusLine(range(1, 32))}`, '',
  `**Expansion 33–57:** ${statusLine(range(33, 57))}`, '', `**Expansion 58–87:** ${statusLine(range(58, 87))}`, '',
  `**By dependency:** ${Object.entries(count(REG.features, 'dependency')).map(([k, v]) => `${k} ${v}`).join(' · ')}`, '',
  'No feature is reported as implemented unless the code exists; VERIFIED additionally needs passing automated tests. The proposed migrations 0005 and 0006 are **not applied** to the application database.', '',
  '## Status definitions', '', ...Object.entries(REG.statusDefinitions).map(([k, v]) => `- **${k}** — ${v}`), '',
  '## Dependency types', '', ...Object.entries(REG.dependencyDefinitions).map(([k, v]) => `- **${k}** — ${v}`), '',
  '## Registry', '', '| # | Feature | Phase | Dependency | Status | New database objects | Depends on |', '| --- | --- | --- | --- | --- | --- | --- |',
  ...REG.features.map((f) => `| ${f.id} | ${f.name} | ${f.phase} | ${f.dependency} | ${f.status} | ${[...(f.newDb?.tables || []), ...(f.newDb?.columns || []), ...(f.newDb?.views || []), ...(f.newDb?.routines || [])].join(', ') || '—'} | ${deps[f.id].map((d) => `#${d}`).join(', ') || '—'} |`), '',
  '## Phased plan', '', ...REG.phases.map((p) => `- **${p.id}** — ${p.name}${p.features ? `: ${p.features.map((i) => `#${i}`).join(', ')}` : ''}`), '',
  '**Gate before each phase is released:**', '', ...REG.phaseGate.map((g, i) => `${i + 1}. ${g}`), '',
  `## Features 33–${N} in detail`, ''];
for (const f of REG.features.filter((x) => x.id >= 33)) {
  md.push(`### ${f.id}. ${f.name}`, '', `**Status:** ${f.status} · **Dependency:** ${f.dependency} · **Phase:** ${f.phase}${deps[f.id].length ? ` · **Depends on:** ${deps[f.id].map((d) => `#${d} ${byId[d].name}`).join(', ')}` : ''}`, '', f.summary, '');
  const r = f.reuse || {};
  md.push(`- **Reuses:** tables ${list(r.tables)}; views ${list(r.views)}; routines ${list(r.routines)}; APIs ${list(r.api)}; UI ${list(r.ui)}`);
  md.push(`- **Database change:** ${[...(f.newDb?.tables || []).map((t) => `new table \`${t}\``), ...(f.newDb?.columns || []).map((c) => `column \`${c}\``), ...(f.newDb?.views || []).map((v) => `view \`${v}\``), ...(f.newDb?.routines || []).map((v) => `function \`${v}\``)].join(', ') || 'none'}${f.newDb?.migration ? ` (in \`${f.newDb.migration}\`)` : ''}. ${f.newDb?.why || ''}`);
  if (f.api) md.push(`- **API:** ${f.api.map((a) => `\`${a}\``).join('; ')}`);
  if (f.frontend) md.push(`- **Frontend:** ${f.frontend.join('; ')}`);
  if (f.security) md.push(`- **Security and privacy:** ${f.security.join('; ')}`);
  if (f.tests?.existing) md.push(`- **Passing tests:** ${f.tests.existing.map((t) => `"${t}"`).join('; ')}`);
  if (f.tests?.proposed) md.push(`- **Tests to add:** ${f.tests.proposed.join('; ')}`);
  if (f.gaps) md.push(`- **Gaps:** ${f.gaps.join(' ')}`);
  if (f.outstanding) md.push(`- **External blocker:** ${f.outstanding.join('; ')}`);
  md.push('');
}
md.push('## Original features 1–32: evidence and gaps', '', '| # | Feature | Status | Evidence (passing tests) | Gaps |', '| --- | --- | --- | --- | --- |',
  ...range(1, 32).map((f) => `| ${f.id} | ${f.name} | ${f.status} | ${(f.tests?.existing || []).map((t) => `"${t}"`).join('; ') || '—'} | ${(f.gaps || []).join(' ') || '—'} |`), '');
fs.mkdirSync(path.join(ROOT, 'docs/roadmap/.build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/roadmap/.build/dependency-graph.json'), JSON.stringify({ deps, names: Object.fromEntries(REG.features.map((f) => [f.id, f.name])), status: Object.fromEntries(REG.features.map((f) => [f.id, f.status])), dependency: Object.fromEntries(REG.features.map((f) => [f.id, f.dependency])), phase: Object.fromEntries(REG.features.map((f) => [f.id, f.phase])) }, null, 1));
fs.writeFileSync(path.join(ROOT, 'docs/roadmap/FEATURE_REGISTRY.md'), md.join('\n'));
console.log(`Registry OK: ${N} features. ${statusLine(REG.features)}${PASSED ? ` · VERIFIED checked against ${RESULTS.backend.counts.passed + RESULTS.frontend.counts.passed} passing tests` : ' · (no --results: VERIFIED checked for test existence only)'}`);
console.log(`  routes found ${routes.size}, test names found ${testNames.size}; wrote docs/roadmap/FEATURE_REGISTRY.md`);
