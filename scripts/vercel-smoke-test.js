#!/usr/bin/env node
'use strict';

// Dependency-free production smoke test for a deployed LOOP Vercel project.
// It tests the public frontend, API liveness, and database/schema readiness.
async function main() {
  const base = String(process.env.LOOP_PRODUCTION_URL || process.argv[2] || '').trim().replace(/\/+$/, '');
  if (!base) {
    console.error('Usage: LOOP_PRODUCTION_URL=https://your-loop.vercel.app node scripts/vercel-smoke-test.js');
    process.exitCode = 2;
    return;
  }

  let parsed;
  try { parsed = new URL(base); } catch {
    console.error('LOOP_PRODUCTION_URL must be an absolute URL.');
    process.exitCode = 2;
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    console.error('Production smoke tests require HTTPS (localhost is allowed for local testing).');
    process.exitCode = 2;
    return;
  }

  const checks = [
    { name: 'homepage', path: '/', accept: (r) => r.ok && /text\/html/i.test(r.headers.get('content-type') || '') },
    { name: 'API liveness', path: '/api/health', accept: (r, body) => r.status === 200 && body?.status === 'ok' },
    { name: 'API + database readiness', path: '/api/ready', accept: (r, body) => r.status === 200 && body?.status === 'ready' },
  ];
  let failed = 0;
  for (const check of checks) {
    try {
      const response = await fetch(`${base}${check.path}`, {
        redirect: 'follow',
        headers: { accept: check.path === '/' ? 'text/html' : 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      let body = null;
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        body = await response.json().catch(() => null);
      }
      const ok = check.accept(response, body);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name}: HTTP ${response.status}`);
      if (!ok) {
        const detail = body?.error?.code || body?.schema?.problem || body?.message || response.statusText;
        if (detail) console.log(`     ${String(detail).slice(0, 240)}`);
        failed += 1;
      }
    } catch (error) {
      console.error(`FAIL ${check.name}: ${error.name === 'TimeoutError' ? 'request timed out' : error.message}`);
      failed += 1;
    }
  }
  console.log(`\n${checks.length - failed}/${checks.length} production smoke checks passed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
