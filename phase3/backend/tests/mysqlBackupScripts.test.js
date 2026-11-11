'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGzip } = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const common = require('../../scripts/lib/mysqlBackupCommon');
const backup = require('../../scripts/mysql-backup');
const restore = require('../../scripts/mysql-restore-drill');

test('backup scripts can load simple root .env values without overriding shell secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-env-test-'));
  const file = path.join(dir, '.env');
  const key = 'LOOP_BACKUP_ENV_TEST';
  try {
    delete process.env[key];
    fs.writeFileSync(file, `# comment\n${key}=from-file\n`);
    assert.equal(common.loadEnvFile(file), 1);
    assert.equal(process.env[key], 'from-file');
    process.env[key] = 'from-shell';
    assert.equal(common.loadEnvFile(file), 0);
    assert.equal(process.env[key], 'from-shell');
  } finally {
    delete process.env[key];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('database names accept safe MySQL identifiers and reject SQL punctuation', () => {
  assert.equal(common.validateDatabaseName('loop_prod_1'), 'loop_prod_1');
  assert.throws(() => common.validateDatabaseName('loop; DROP DATABASE x'), /must be 1-64 characters/);
  assert.throws(() => common.validateDatabaseName(''), /must be 1-64 characters/);
});

test('MySQL option file values escape quotes, backslashes and newlines', () => {
  const v = common.optionValue('p\\"ass\nword');
  assert.equal(v, '"p\\\\\\"ass\\nword"');
});

test('backup client config uses TLS identity verification when SSL is enabled', () => {
  const config = common.buildClientDefaults({ host: 'db.example', port: 3306, user: 'backup', password: 'secret', ssl: true, sslCa: '/tmp/ca.pem' });
  assert.match(config, /ssl-mode=VERIFY_IDENTITY/);
  assert.match(config, /ssl-ca=/);
  assert.match(config, /password=\"secret\"/);
});

test('restore drills only allow a separate loop_restore_ schema', () => {
  assert.equal(common.restoreTargetName('loop_restore_20261110', 'loop_prod'), 'loop_restore_20261110');
  assert.throws(() => common.restoreTargetName('loop_prod', 'loop_prod'), /must never target DB_NAME/);
  assert.throws(() => common.restoreTargetName('loop_prod_restore', 'loop_prod'), /must start with loop_restore_/);
});

test('backup environment rejects invalid ports and retention settings', () => {
  assert.throws(() => backup.backupConfig({ DB_HOST: 'db', DB_NAME: 'loop', DB_BACKUP_USER: 'b', DB_BACKUP_PASSWORD: 'p', DB_BACKUP_PORT: '70000' }), /DB_BACKUP_PORT/);
  assert.throws(() => backup.pruneLocal(os.tmpdir(), 0), /DB_BACKUP_RETENTION_DAYS/);
});

test('backup environment requires dedicated backup or owner credentials, not app credentials', () => {
  assert.throws(() => backup.backupConfig({ DB_HOST: 'db', DB_NAME: 'loop', DB_APP_USER: 'app', DB_APP_PASSWORD: 'app-pass' }), /DB_BACKUP_USER or DB_OWNER_USER/);
  const c = backup.backupConfig({ DB_HOST: 'db', DB_NAME: 'loop', DB_OWNER_USER: 'owner', DB_OWNER_PASSWORD: 'owner-pass' });
  assert.equal(c.database, 'loop');
  assert.equal(c.user, 'owner');
});

test('restore verifies gzip integrity and a matching SHA-256 sidecar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-backup-test-'));
  const file = path.join(dir, 'sample.sql.gz');
  try {
    const payload = Buffer.from('CREATE TABLE sample(id INT);\n');
    await pipeline(Readable.from([payload]), createGzip(), fs.createWriteStream(file));
    const digest = await backup.sha256File(file);
    fs.writeFileSync(`${file}.sha256`, `${digest}  sample.sql.gz\n`);
    assert.equal(await restore.verifyBackup(file), digest);
    fs.writeFileSync(`${file}.sha256`, `${'0'.repeat(64)}  sample.sql.gz\n`);
    await assert.rejects(restore.verifyBackup(file), /checksum mismatch/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('backup streams a mocked mysqldump into a verified compressed archive', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-mysqldump-test-'));
  const fakeDump = path.join(dir, 'fake-mysqldump');
  try {
    fs.writeFileSync(fakeDump, '#!/bin/sh\nprintf "CREATE TABLE backup_smoke (id INT);\\n"\n', { mode: 0o700 });
    fs.chmodSync(fakeDump, 0o700);
    const result = await backup.backup({
      DB_HOST: '127.0.0.1', DB_NAME: 'loop_test', DB_BACKUP_USER: 'backup', DB_BACKUP_PASSWORD: 'secret',
      DB_BACKUP_DIR: dir, DB_BACKUP_RETENTION_DAYS: '14', MYSQLDUMP_BIN: fakeDump,
    });
    assert.equal(result.remoteUploaded, false);
    assert.equal(await backup.sha256File(result.file), result.sha256);
    assert.ok(fs.existsSync(result.checksum));
    await backup.verifyGzip(result.file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore drill imports only into an empty loop_restore_ schema using a mocked mysql client', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-mysql-restore-test-'));
  const file = path.join(dir, 'sample.sql.gz');
  const fakeMysql = path.join(dir, 'fake-mysql');
  const counter = path.join(dir, 'counter.txt');
  const capture = path.join(dir, 'restored.sql');
  const sql = 'CREATE TABLE sample (id INT);\nINSERT INTO sample VALUES (1);\n';
  try {
    await pipeline(Readable.from([Buffer.from(sql)]), createGzip(), fs.createWriteStream(file));
    const digest = await backup.sha256File(file);
    fs.writeFileSync(`${file}.sha256`, `${digest}  sample.sql.gz\n`);
    fs.writeFileSync(fakeMysql, `#!/usr/bin/env node\nconst fs=require('node:fs');\nconst args=process.argv.slice(2);\nif(args.includes('-e')){let n=0;try{n=Number(fs.readFileSync(process.env.MOCK_MYSQL_COUNTER,'utf8'))}catch{};n++;fs.writeFileSync(process.env.MOCK_MYSQL_COUNTER,String(n));process.stdout.write(n===1?'0':'5');}else{const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>fs.writeFileSync(process.env.MOCK_MYSQL_CAPTURE,Buffer.concat(chunks)));}\n`, { mode: 0o700 });
    fs.chmodSync(fakeMysql, 0o700);
    const result = await restore.restoreDrill({
      ...process.env,
      DB_NAME: 'loop_production', DB_BACKUP_FILE: file, DB_BACKUP_RESTORE_DATABASE: 'loop_restore_smoke',
      DB_HOST: '127.0.0.1', DB_BACKUP_USER: 'backup', DB_BACKUP_PASSWORD: 'secret',
      MYSQL_BIN: fakeMysql, MOCK_MYSQL_COUNTER: counter, MOCK_MYSQL_CAPTURE: capture,
    });
    assert.equal(result.target, 'loop_restore_smoke');
    assert.equal(result.tables, 5);
    assert.equal(fs.readFileSync(capture, 'utf8'), sql);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verified local backup is retained when optional S3 upload fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-backup-s3-fail-test-'));
  const fakeDump = path.join(dir, 'fake-mysqldump');
  const fakeAws = path.join(dir, 'fake-aws');
  try {
    fs.writeFileSync(fakeDump, '#!/bin/sh\nprintf "CREATE TABLE backup_smoke (id INT);\\n"\n', { mode: 0o700 });
    fs.writeFileSync(fakeAws, '#!/bin/sh\nexit 9\n', { mode: 0o700 });
    fs.chmodSync(fakeDump, 0o700); fs.chmodSync(fakeAws, 0o700);
    await assert.rejects(backup.backup({
      ...process.env,
      DB_HOST: '127.0.0.1', DB_NAME: 'loop_test', DB_BACKUP_USER: 'backup', DB_BACKUP_PASSWORD: 'secret',
      DB_BACKUP_DIR: dir, DB_BACKUP_RETENTION_DAYS: '14', MYSQLDUMP_BIN: fakeDump,
      DB_BACKUP_S3_URI: 's3://private-loop-backup/daily', AWS_CLI_BIN: fakeAws,
    }), /verified local backup was retained/);
    const archived = fs.readdirSync(dir).filter((name) => /^loop-db-.*\.sql\.gz$/.test(name));
    assert.equal(archived.length, 1);
    assert.ok(fs.existsSync(path.join(dir, `${archived[0]}.sha256`)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
