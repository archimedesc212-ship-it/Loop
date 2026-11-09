// Run pipeline jobs from the command line (the same code the scheduler and Admin › Pipeline use).
//   npm run pipeline                       weekly intelligence update (idempotent per week)
//   npm run pipeline -- weekly --force     run it again this week as a new job
//   npm run pipeline -- ingest [file.json] [--force]
//   npm run pipeline -- trends
//   npm run pipeline -- cleanup            close idle sessions, expire private sessions
const pipeline = require('../src/services/pipeline/pipelineService');
const { pool } = require('../src/config/db');
const { jobs } = require('../src/config/env');

(async () => {
  const [cmd = 'weekly', arg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const force = process.argv.includes('--force');
  let r;
  if (cmd === 'weekly') r = await pipeline.runWeeklyIntelligence({ force, reason: 'cli' });
  else if (cmd === 'ingest') r = await pipeline.runIngest({ sourceCode: 'MUSE_CATALOG_FEED', file: arg || null, force });
  else if (cmd === 'trends') r = await pipeline.runTrendSnapshot({ key: `trend:cli:${Date.now()}` });
  else if (cmd === 'cleanup') r = { idleSessionsClosed: await pipeline.closeIdleSessions(jobs.sessionIdleMinutes), privateSessions: await pipeline.cleanupIncognito() };
  else throw new Error(`Unknown command "${cmd}". Use weekly | ingest | trends | cleanup`);
  console.log(JSON.stringify(r, null, 2));
  await pool.end();
})().catch(async (e) => { console.error(e.sqlMessage || e.message); await pool.end(); process.exitCode = 1; });
