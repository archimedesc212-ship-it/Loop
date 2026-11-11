// Mutation check for the proposed-migration tests: each deliberately broken copy of a migration
// must make test-proposed-migration.js fail. A "MISSED" line means the tests have a blind spot.
// Broken copies live only in docs/roadmap/.build/ and are deleted afterwards.
//   node backend/scripts/roadmap/mutation-check.js
// Developed by Vaishnav Sai.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const BUILD = path.join(ROOT, 'docs/roadmap/.build');
const fn = (name) => new RegExp(`CREATE TRIGGER ${name}[\\s\\S]*?END\\$\\$\\n`);
const MUTATIONS = {
  '0005': {
    'no UPDATE self-follow trigger': (s) => s.replace(fn('trg_uf_bu'), ''),
    'no HOST-membership trigger': (s) => s.replace(fn('trg_lr_ai'), ''),
    'no room transition trigger': (s) => s.replace(fn('trg_lr_bu'), ''),
    'no host-delete guard': (s) => s.replace(fn('trg_lrm_bd'), ''),
    'harmonic function without NULL / range handling': (s) => s.replace(/ {2}IF p_key1 IS NULL[^\n]*\n {2}IF p_key1 NOT BETWEEN[^\n]*\n/, ''),
    'ENUM rebuilt from a fixed list (drops values added elsewhere)': (s) => s.replace("CALL mig_0005_append_enum('playlists', 'kind', 'EDITORIAL');",
      "ALTER TABLE playlists MODIFY COLUMN kind ENUM('MANUAL','SMART','SAVED_MIX','WORLD','EDITORIAL') NOT NULL DEFAULT 'MANUAL';"),
    'cancelled room may have started': (s) => s.replace("AND (status <> 'CANCELLED' OR (started_at IS NULL AND ended_at IS NULL))", ''),
    'no table-shape guard': (s) => s.replace("CALL mig_0005_require_columns('listening_rooms',", '-- CALL mig_0005_require_columns(\'listening_rooms\','),
  },
  '0006': {
    'no arm UPDATE trigger': (s) => s.replace(fn('trg_arm_bu'), ''),
    'no notification link CHECK': (s) => s.replace(/ {2}CONSTRAINT chk_ntf_link[^\n]*\n/, ''),
    'no private-session rule on bookmarks': (s) => s.replace(/ {2}IF EXISTS \(SELECT 1 FROM incognito_sessions[\s\S]*?END IF;\n/, ''),
    'retention seed enables a rule that is not enforced today': (s) => s.replace("('LOGIN_EVENTS', 180, 0)", "('LOGIN_EVENTS', 180, 1)"),
    'no 0005 prerequisite check': (s) => s.replace("CALL mig_0006_require_columns('playlists', 'visibility,version');", ''),
  },
};

let missed = 0;
for (const [version, muts] of Object.entries(MUTATIONS)) {
  const casesFile = path.join(__dirname, `cases-${version}.js`);
  const cases = require(casesFile);
  const src = fs.readFileSync(path.join(ROOT, cases.file), 'utf8');
  const mv = `9${version.slice(1)}`;
  const mutFile = `docs/roadmap/.build/${mv}_mutation.sql`;
  const mutCases = path.join(__dirname, `cases-${mv}.js`);
  try {
    for (const [name, f] of Object.entries(muts)) {
      const m = f(src);
      if (m === src) { console.log(`ERROR   ${version} mutation did not apply: ${name}`); missed++; continue; }
      fs.mkdirSync(BUILD, { recursive: true });
      fs.writeFileSync(path.join(ROOT, mutFile), m);
      fs.writeFileSync(mutCases, fs.readFileSync(casesFile, 'utf8').replace(`version: '${version}'`, `version: '${mv}'`).replace(`file: '${cases.file}'`, `file: '${mutFile}'`));
      let out = '';
      try { out = execFileSync('node', [path.join(__dirname, 'test-proposed-migration.js'), mv], { encoding: 'utf8' }); } catch (e) { out = e.stdout; }
      const fails = out.split('\n').filter((l) => l.startsWith('FAIL'));
      if (!fails.length) missed++;
      console.log(`${fails.length ? 'CAUGHT' : 'MISSED'}  ${version} ${name} — ${fails.length ? fails[0].slice(6, 120) : 'no test failed'}`);
    }
  } finally {
    fs.rmSync(mutCases, { force: true });
    fs.rmSync(path.join(ROOT, mutFile), { force: true });
  }
}
console.log(missed ? `\n${missed} mutation(s) not caught` : '\nevery mutation was caught');
if (missed) process.exitCode = 1;
