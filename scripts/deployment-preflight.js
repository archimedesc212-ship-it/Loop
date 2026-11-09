#!/usr/bin/env node
/* global require, __dirname, URL, process, console */
'use strict';

// Static deployment contract checks. No cloud credentials or database are needed.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push('Missing required file: ' + relativePath);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function requireCheck(condition, message) {
  if (condition) passes.push(message);
  else failures.push(message);
}

function checkBareHttpsOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === 'https:'
    && parsed.pathname === '/'
    && parsed.search === ''
    && parsed.hash === ''
    && parsed.username === ''
    && parsed.password === ''
    && parsed.origin === value.replace(/\/$/, '');
}

const packageSource = read('package.json');
let pkg = {};
try {
  pkg = JSON.parse(packageSource);
} catch {
  failures.push('Root package.json must be valid JSON.');
}

const render = read('render.yaml');
const vercel = read('vercel.ts');
const app = read('backend/src/app.js');
const server = read('backend/src/server.js');
const scheduler = read('backend/src/services/scheduler.js');
const auth = read('backend/src/middleware/auth.js');
const apiClient = read('frontend/src/services/api.js');
const gitignore = read('.gitignore');
const hybridDocs = read('docs/DEPLOYMENT_HYBRID.md');

requireCheck(pkg.scripts && pkg.scripts.build === 'npm run build --workspace frontend',
  'The root build script builds the Vite frontend workspace.');
requireCheck(pkg.scripts && pkg.scripts.start === 'npm run start --workspace backend',
  'The root start script runs the persistent Express backend workspace.');
requireCheck(pkg.scripts && pkg.scripts['deploy:check'] === 'node scripts/deployment-preflight.js',
  'The root package exposes npm run deploy:check.');

requireCheck(/installCommand:\s*'npm ci'/.test(vercel),
  'Vercel installs the npm workspace from the repository root.');
requireCheck(/buildCommand:\s*'npm run build'/.test(vercel),
  'Vercel builds the frontend through the root workspace script.');
requireCheck(/outputDirectory:\s*'frontend\/dist'/.test(vercel),
  'Vercel publishes frontend/dist.');
requireCheck(/process\.env\.LOOP_API_ORIGIN/.test(vercel)
  && /protocol\s*!==\s*'https:'/.test(vercel)
  && /pathname\s*!==\s*'\/'/.test(vercel)
  && /search\s*\|\|/.test(vercel)
  && /hash\s*\|\|/.test(vercel)
  && /username\s*\|\|/.test(vercel)
  && /parsedApiOrigin\.password/.test(vercel),
  'Vercel requires a validated bare HTTPS LOOP_API_ORIGIN.');
requireCheck(/source:\s*'\/api\/:path\*'/.test(vercel)
  && /parsedApiOrigin\.origin/.test(vercel)
  && /\/api\/:path\*/.test(vercel),
  'Vercel proxies /api/* to the configured API origin.');
requireCheck(/source:\s*'\/:path\*'/.test(vercel)
  && /destination:\s*'\/index\.html'/.test(vercel),
  'Vercel routes client-side pages to the SPA entry point.');
requireCheck(!/\bcrons\s*:/.test(vercel),
  'Vercel does not define duplicate scheduled jobs.');
requireCheck(
  !['vercel.json', 'vercel.yaml', 'vercel.yml'].some((file) => fs.existsSync(path.join(root, file))),
  'Only vercel.ts is present as Vercel project configuration.'
);

requireCheck(/name:\s*loop-muse-api/.test(render)
  && /runtime:\s*node/.test(render)
  && /plan:\s*starter/.test(render),
  'Render blueprint defines the always-on Node.js API service.');
requireCheck(/autoDeploy:\s*false/.test(render),
  'Render auto-deploy is disabled until an operator deliberately releases.');
requireCheck(/healthCheckPath:\s*\/api\/health/.test(render),
  'Render health checks use the API liveness endpoint.');
requireCheck(/key:\s*JOBS_ENABLED\s*\n\s*value:\s*["']?true/.test(render)
  && /key:\s*SESSION_SECRET\s*\n\s*generateValue:\s*true/.test(render),
  'Render enables the in-process scheduler and generates a session secret.');
requireCheck(/key:\s*TRUST_PROXY\s*\n\s*value:\s*["']?1/.test(render)
  && /key:\s*COOKIE_SECURE\s*\n\s*value:\s*["']?true/.test(render),
  'Render trusts its configured proxy hop and forces secure cookies.');
requireCheck(!/(?:buildCommand|startCommand):[^\n]*(?:db:setup|npm run setup)/.test(render),
  'Render build/start commands never run destructive database setup.');

requireCheck(/app\.use\('\/api',\s*cors\(/.test(app)
  && /sameOriginOnly\(corsOrigins\)/.test(app),
  'Express applies the configured CORS allowlist and Origin guard.');
requireCheck(/app\.get\('\/api\/health'/.test(app)
  && /app\.get\('\/api\/ready'/.test(app),
  'Express exposes liveness and database/schema readiness checks.');
requireCheck(/if\s*\(jobs\.enabled\)\s*scheduler\.start\(\)/.test(server)
  && /scheduler\.stop\(\)/.test(server),
  'The API process starts and stops the scheduler with its lifecycle.');
requireCheck(/setInterval/.test(scheduler)
  && /runWeeklyIntelligence/.test(scheduler)
  && /runTrendSnapshot/.test(scheduler),
  'Scheduled maintenance stays in the persistent API process.');
requireCheck(/sameSite:\s*'strict'/.test(auth)
  && /httpOnly/.test(auth)
  && /X-CSRF-Token/.test(auth),
  'Strict session cookies and CSRF enforcement remain in place.');
requireCheck(/fetch\(/.test(apiClient)
  && /\/api\$\{path\}/.test(apiClient)
  && /credentials:\s*'same-origin'/.test(apiClient)
  && /X-CSRF-Token/.test(apiClient),
  'The browser uses same-origin API calls and sends the CSRF header.');
requireCheck(/^\s*\.env\s*$/m.test(gitignore)
  && /^\s*\.env\.\*\s*$/m.test(gitignore)
  && /^\s*!\.env\.example\s*$/m.test(gitignore),
  'Live environment files are ignored while .env.example stays tracked.');
requireCheck(/Never run.*db:setup/.test(hybridDocs)
  && /JOBS_ENABLED/.test(hybridDocs)
  && /LOOP_API_ORIGIN/.test(hybridDocs),
  'The hybrid runbook documents database safety, scheduler and API origin.');

const suppliedOrigin = process.env.LOOP_API_ORIGIN;
const productionMode = process.argv.includes('--production');
if (suppliedOrigin) {
  requireCheck(checkBareHttpsOrigin(suppliedOrigin),
    'Provided LOOP_API_ORIGIN is a bare HTTPS origin.');
} else if (productionMode) {
  failures.push('Production preflight requires LOOP_API_ORIGIN to be set.');
} else {
  passes.push('No live API origin supplied; production-only origin check was skipped.');
}

console.log('\nLOOP hybrid deployment preflight');
console.log('--------------------------------');
for (const message of passes) console.log('PASS  ' + message);
for (const message of failures) console.error('FAIL  ' + message);
console.log('\n' + passes.length + ' passed · ' + failures.length + ' failed');

if (failures.length) process.exitCode = 1;
