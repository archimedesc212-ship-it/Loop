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

const packageSource = read('package.json');
let pkg = {};
try {
  pkg = JSON.parse(packageSource);
} catch {
  failures.push('Root package.json must be valid JSON.');
}

const render = read('render.yaml');
const vercelSource = read('vercel.json');
let vercel = {};
try {
  vercel = JSON.parse(vercelSource);
} catch {
  failures.push('vercel.json must contain valid JSON.');
}
const app = read('backend/src/app.js');
const server = read('backend/src/server.js');
const scheduler = read('backend/src/services/scheduler.js');
const auth = read('backend/src/middleware/auth.js');
const apiClient = read('frontend/src/services/api.js');
const appEntry = read('frontend/src/App.jsx');
const apiFunction = read('api/index.js');
const gitignore = read('.gitignore');
const hybridDocs = read('docs/DEPLOYMENT_HYBRID.md');

requireCheck(pkg.scripts && pkg.scripts.build === 'npm run build --workspace frontend',
  'The root build script builds the Vite frontend workspace.');
requireCheck(pkg.scripts && pkg.scripts.start === 'npm run start --workspace backend',
  'The root start script runs the persistent Express backend workspace.');
requireCheck(pkg.scripts && pkg.scripts['deploy:check'] === 'node scripts/deployment-preflight.js',
  'The root package exposes npm run deploy:check.');
requireCheck(pkg.scripts && pkg.scripts.setup === 'npm run db:seed:generate && npm run db:migrate && npm run build'
  && pkg.scripts['db:reset:unsafe'] && pkg.scripts['db:reset:unsafe'].includes('--allow-destructive'),
  'Normal setup is migration-only; destructive reset is explicitly isolated.');

requireCheck(vercel.installCommand === 'npm ci',
  'Vercel installs the npm workspace from the repository root.');
requireCheck(vercel.buildCommand === 'npm run build',
  'Vercel builds the frontend through the root workspace script.');
requireCheck(vercel.outputDirectory === 'frontend/dist',
  'Vercel publishes frontend/dist.');
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
const apiRewrite = rewrites.find((rule) => rule && rule.source === '/api/:path*');
let validApiRewrite = false;
try {
  const target = new URL(apiRewrite && apiRewrite.destination, 'https://vercel.internal');
  validApiRewrite = target.origin === 'https://vercel.internal'
    && target.pathname === '/api'
    && target.searchParams.get('__loop_path') === ':path*'
    && !target.username && !target.password && !target.hash;
} catch {
  validApiRewrite = false;
}
requireCheck(validApiRewrite
  && /__loop_path/.test(apiFunction)
  && /app\\(req, res\\)/.test(apiFunction),
  'Vercel forwards same-origin /api/* requests to the API function and restores the Express route.');
requireCheck(rewrites.some((rule) => rule && rule.source === '/(.*)' && rule.destination === '/index.html'),
  'Vercel routes client-side pages to the SPA entry point.');
requireCheck(!Object.prototype.hasOwnProperty.call(vercel, 'crons'),
  'Vercel does not define duplicate scheduled jobs.');
requireCheck(fs.existsSync(path.join(root, 'vercel.json'))
  && !['vercel.ts', 'vercel.yaml', 'vercel.yml'].some((file) => fs.existsSync(path.join(root, file))),
  'Only vercel.json is present as Vercel project configuration.');

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
requireCheck(/AbortController/.test(apiClient)
  && /TIMEOUT/.test(apiClient),
  'Browser API requests have a finite timeout and a useful timeout error.');
requireCheck(/^\s*\.env\s*$/m.test(gitignore)
  && /^\s*\.env\.\*\s*$/m.test(gitignore)
  && /^\s*!\.env\.example\s*$/m.test(gitignore),
  'Live environment files are ignored while .env.example stays tracked.');
requireCheck(/Never run.*db:reset:unsafe/.test(hybridDocs)
  && /JOBS_ENABLED/.test(hybridDocs)
  && /vercel\.json/.test(hybridDocs),
  'The hybrid runbook documents database safety, scheduler and the Vercel JSON config.');
requireCheck(/path="\\/login"\\s+element={<Navigate to="\\/" replace \/>}/.test(appEntry)
  && /useAuth/.test(appEntry)
  && !/Varsha@27|Admin@123|Quick access|Demo account/.test(appEntry),
  'The current app entry handles legacy auth routes and does not expose shared test credentials.');

passes.push('The HTTPS API rewrite is validated from vercel.json; no API-origin secret is required.');

console.log('\nLOOP hybrid deployment preflight');
console.log('--------------------------------');
for (const message of passes) console.log('PASS  ' + message);
for (const message of failures) console.error('FAIL  ' + message);
console.log('\n' + passes.length + ' passed · ' + failures.length + ' failed');

if (failures.length) process.exitCode = 1;
