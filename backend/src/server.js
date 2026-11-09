// Starts the API and the background scheduler.
const app = require('./app');
const { port, jobs } = require('./config/env');
const { pool } = require('./config/db');
const scheduler = require('./services/scheduler');
const providers = require('./providers');

const server = app.listen(port, () => {
  console.log(`MUSE API listening on http://localhost:${port}`);
  // provider configuration states only — never secret values
  console.log(`Providers: ${providers.status().map((p) => `${p.code}=${p.state}`).join(' ')}`);
  if (jobs.enabled) scheduler.start();
  else console.log('Background jobs disabled (JOBS_ENABLED=false)');
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  scheduler.stop();
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
