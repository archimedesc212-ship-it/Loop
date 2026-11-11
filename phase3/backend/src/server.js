// Persistent Node entrypoint for local development and non-serverless hosts.
// Vercel imports src/app.js directly and never starts this listener or scheduler.
const { port, jobs, validateEnvironment } = require('./config/env');

try {
  validateEnvironment();
} catch (err) {
  console.error(`[config] ${err.message}. Configure the required environment variables before starting LOOP.`);
  process.exit(1);
}

const app = require('./app');
const { pool } = require('./config/db');
const scheduler = require('./services/scheduler');
const providers = require('./providers');

const server = app.listen(port, () => {
  console.log(`LOOP API listening on port ${port}`);
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
