// Runs the backend (node --test) and frontend (vitest) suites with JUnit reporters and records which
// tests passed, so check-registry.js --results can refuse a VERIFIED status whose test did not pass.
//   node backend/scripts/roadmap/collect-test-results.js
// Output: docs/roadmap/.build/test-results.json  {when, backend:{passed,failed}, frontend:{…}, passed:[names], failed:[names]}
// Exit code 1 if any test failed (the file is still written, failures included).
// Developed by Vaishnav Sai.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'docs/roadmap/.build');
fs.mkdirSync(OUT, { recursive: true });

const unxml = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

/** Parse <testcase name="…"> … </testcase> elements; a case with <failure>, <error> or <skipped> is not a pass. */
function parse(xml) {
  const passed = [];
  const failed = [];
  const counts = { passed: 0, failed: 0 };
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    // node's JUnit reporter escapes some names twice (&amp;quot;), so decode until stable
    let name = (m[1].match(/\bname="([^"]*)"/) || [])[1] || '';
    for (let prev = null; prev !== name;) { prev = name; name = unxml(name); }
    const body = m[3] || '';
    const list = /<(failure|error|skipped)\b/.test(body) ? failed : passed;
    list.push(name);
    counts[list === passed ? 'passed' : 'failed']++;
    // vitest prefixes the describe() title: "TrackList > hides …"; also record the test's own title
    if (name.includes(' > ')) list.push(name.split(' > ').slice(1).join(' > '));
  }
  return { passed, failed, counts };
}

function run(label, cmd, args, cwd, file) {
  fs.rmSync(file, { force: true });
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  if (!fs.existsSync(file)) throw new Error(`${label}: no JUnit report written (exit ${r.status})\n${(r.stderr || '').slice(-2000)}`);
  const res = parse(fs.readFileSync(file, 'utf8'));
  console.log(`${label}: ${res.counts.passed} passed, ${res.counts.failed} failed (${Math.round((Date.now() - t) / 1000)} s, exit ${r.status})`);
  return { ...res, exitCode: r.status };
}

const backendXml = path.join(OUT, 'backend-junit.xml');
const frontendXml = path.join(OUT, 'frontend-junit.xml');
const backend = run('backend', process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=junit', `--test-reporter-destination=${backendXml}`, 'tests/*.test.js'],
  path.join(ROOT, 'backend'), backendXml);
const frontend = run('frontend', 'npx', ['vitest', 'run', '--reporter=junit', `--outputFile=${frontendXml}`], path.join(ROOT, 'frontend'), frontendXml);

const out = { when: new Date().toISOString(), backend, frontend,
  passed: [...backend.passed, ...frontend.passed], failed: [...backend.failed, ...frontend.failed] };
fs.writeFileSync(path.join(OUT, 'test-results.json'), JSON.stringify(out, null, 1));
console.log(`total: ${backend.counts.passed + frontend.counts.passed} passed, ${backend.counts.failed + frontend.counts.failed} failed → docs/roadmap/.build/test-results.json`);
if (out.failed.length || backend.exitCode || frontend.exitCode) process.exitCode = 1;
