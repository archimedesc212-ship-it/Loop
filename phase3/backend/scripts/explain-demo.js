// Prints the query-performance lab: each important query explained WITH its
// index and again with the index ignored, plus EXPLAIN ANALYZE timings.
//   npm run demo:explain           summary table
//   npm run demo:explain -- --tree also print the EXPLAIN FORMAT=TREE plans
const health = require('../src/services/healthService');
const { pool } = require('../src/config/db');

(async () => {
  const lab = await health.performanceLab();
  const tree = process.argv.includes('--tree');
  for (const q of lab) {
    console.log(`\n■ ${q.title}`);
    console.log(`  why:   ${q.why}`);
    console.log(`  index: ${q.index}`);
    console.log(`  sql:   ${q.sql}`);
    const fmt = (e) => e.plan.map((p) => `${p.table}: type=${p.type} key=${p.key || '—'} rows≈${p.rows}${p.extra ? ` (${p.extra})` : ''}`).join(' | ');
    console.log(`  WITH index     ${fmt(q.withIndex)}  ${q.withIndex.actualMs !== null ? `${q.withIndex.actualMs} ms` : ''}`);
    if (q.withoutIndex) console.log(`  WITHOUT index  ${fmt(q.withoutIndex)}  ${q.withoutIndex.actualMs !== null ? `${q.withoutIndex.actualMs} ms` : ''}   [${q.withoutLabel}]`);
    if (tree) {
      console.log(`\n  EXPLAIN ANALYZE (with index):\n${q.withIndex.analyze.replace(/^/gm, '    ')}`);
      if (q.withoutIndex) console.log(`  EXPLAIN ANALYZE (without):\n${q.withoutIndex.analyze.replace(/^/gm, '    ')}`);
    }
  }
  await pool.end();
})().catch(async (e) => { console.error(e.sqlMessage || e.message); await pool.end(); process.exitCode = 1; });
