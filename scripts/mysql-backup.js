#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Writable } = require('node:stream');
const { createGzip, createGunzip } = require('node:zlib');
const { createDefaultsFile, validateDatabaseName, loadEnvFile } = require('./lib/mysqlBackupCommon');

function required(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function backupConfig(env = process.env) {
  const port = Number(env.DB_BACKUP_PORT || env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_BACKUP_PORT must be an integer from 1 to 65535.');
  return {
    host: required(env.DB_BACKUP_HOST || env.DB_HOST, 'DB_BACKUP_HOST or DB_HOST'),
    port,
    database: validateDatabaseName(env.DB_BACKUP_DATABASE || env.DB_NAME, 'DB_BACKUP_DATABASE'),
    user: required(env.DB_BACKUP_USER || env.DB_OWNER_USER, 'DB_BACKUP_USER or DB_OWNER_USER'),
    password: required(env.DB_BACKUP_PASSWORD || env.DB_OWNER_PASSWORD, 'DB_BACKUP_PASSWORD or DB_OWNER_PASSWORD'),
    ssl: env.DB_BACKUP_SSL === 'true' || env.DB_SSL === 'true',
    sslCa: env.DB_BACKUP_SSL_CA || env.DB_SSL_CA || null,
  };
}

function runAwsCopy(file, destination, env) {
  const args = ['s3', 'cp', file, destination, '--only-show-errors', '--no-progress'];
  if (env.DB_BACKUP_S3_ENDPOINT) args.push('--endpoint-url', env.DB_BACKUP_S3_ENDPOINT);
  if (env.DB_BACKUP_S3_REGION) args.push('--region', env.DB_BACKUP_S3_REGION);
  const result = spawnSync(env.AWS_CLI_BIN || 'aws', args, { stdio: 'inherit', env });
  if (result.error) throw new Error(`Could not run AWS CLI for S3-compatible backup upload: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`S3-compatible backup upload failed with exit code ${result.status}.`);
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), new Writable({ write(chunk, enc, cb) { hash.update(chunk); cb(); } }));
  return hash.digest('hex');
}

async function verifyGzip(file) {
  await pipeline(fs.createReadStream(file), createGunzip(), new Writable({ write(_chunk, _enc, cb) { cb(); } }));
}

function pruneLocal(dir, retentionDays, now = Date.now()) {
  const days = Number(retentionDays);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('DB_BACKUP_RETENTION_DAYS must be an integer from 1 to 3650.');
  const cutoff = now - days * 86400000;
  for (const name of fs.readdirSync(dir)) {
    if (!/^loop-db-\d{8}T\d{6}Z\.sql\.gz(?:\.sha256)?$/.test(name)) continue;
    const file = path.join(dir, name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
}

async function backup(env = process.env) {
  const cfg = backupConfig(env);
  const dir = path.resolve(env.DB_BACKUP_DIR || path.join(os.tmpdir(), 'loop-db-backups'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const filename = `loop-db-${stamp}.sql.gz`;
  const output = path.join(dir, filename);
  const defaults = createDefaultsFile(cfg);
  let child;
  let verified = false;
  let stderr = '';
  try {
    child = spawn(env.MYSQLDUMP_BIN || 'mysqldump', [
      `--defaults-extra-file=${defaults.file}`,
      '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--hex-blob',
      '--set-gtid-purged=OFF', '--no-tablespaces', '--column-statistics=0',
      cfg.database,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`mysqldump failed (${signal || `exit ${code}`}): ${stderr.trim().slice(-1800)}`)));
    });
    await pipeline(child.stdout, createGzip({ level: 9 }), fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }));
    await exited;
    fs.chmodSync(output, 0o600);
    await verifyGzip(output);
    const digest = await sha256File(output);
    const checksum = `${output}.sha256`;
    fs.writeFileSync(checksum, `${digest}  ${filename}\n`, { mode: 0o600, flag: 'wx' });
    verified = true;

    const remote = String(env.DB_BACKUP_S3_URI || '').trim();
    if (remote) {
      if (!/^s3:\/\/[A-Za-z0-9._-]+(?:\/[^\s]*)?$/.test(remote)) throw new Error('DB_BACKUP_S3_URI must be an s3://bucket/optional-prefix URI.');
      const target = `${remote.replace(/\/+$/, '')}/${filename}`;
      runAwsCopy(output, target, env);
      runAwsCopy(checksum, `${target}.sha256`, env);
    }

    pruneLocal(dir, Number(env.DB_BACKUP_RETENTION_DAYS || 14));
    return { file: output, checksum, sha256: digest, remoteUploaded: !!remote };
  } catch (error) {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    if (!verified) {
      if (fs.existsSync(output)) fs.unlinkSync(output);
      if (fs.existsSync(`${output}.sha256`)) fs.unlinkSync(`${output}.sha256`);
    }
    if (verified) throw new Error(`${error.message} The verified local backup was retained at ${output}.`);
    throw error;
  } finally {
    fs.rmSync(defaults.dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  loadEnvFile(path.resolve(__dirname, '../.env'));
  backup().then((result) => {
    console.log(`Database backup verified: ${result.file}`);
    console.log(`SHA-256: ${result.sha256}`);
    console.log(`Remote upload: ${result.remoteUploaded ? 'complete' : 'not configured (local backup only)'}`);
  }).catch((error) => {
    console.error(`Database backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { backupConfig, sha256File, verifyGzip, pruneLocal, backup };
