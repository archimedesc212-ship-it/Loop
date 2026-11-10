#!/usr/bin/env node
/* global process, console */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Writable } = require('node:stream');
const { createGunzip } = require('node:zlib');
const { createDefaultsFile, restoreTargetName, validateDatabaseName, loadEnvFile } = require('./lib/mysqlBackupCommon');

function required(value, name) { if (!value) throw new Error(`${name} is required.`); return value; }

async function digestFile(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), new Writable({ write(chunk, enc, cb) { hash.update(chunk); cb(); } }));
  return hash.digest('hex');
}

async function verifyBackup(file) {
  const sidecar = `${file}.sha256`;
  if (!fs.existsSync(sidecar)) throw new Error(`Missing checksum sidecar: ${sidecar}`);
  const text = fs.readFileSync(sidecar, 'utf8');
  const match = text.match(/^([a-f0-9]{64})\s+/i);
  if (!match) throw new Error('Backup checksum sidecar is malformed.');
  const actual = await digestFile(file);
  if (actual !== match[1].toLowerCase()) throw new Error('Backup checksum mismatch; refusing to restore.');
  await pipeline(fs.createReadStream(file), createGunzip(), new Writable({ write(_chunk, _enc, cb) { cb(); } }));
  return actual;
}

function runMysql(args, defaultsFile, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(env.MYSQL_BIN || 'mysql', [`--defaults-extra-file=${defaultsFile}`, '--default-character-set=utf8mb4', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-4000); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`mysql client failed (${signal || `exit ${code}`}): ${stderr.trim().slice(-1800)}`)));
  });
}

async function restoreDrill(env = process.env) {
  const file = path.resolve(required(env.DB_BACKUP_FILE, 'DB_BACKUP_FILE'));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Backup file does not exist: ${file}`);
  const productionName = validateDatabaseName(env.DB_NAME, 'DB_NAME');
  const target = restoreTargetName(env.DB_BACKUP_RESTORE_DATABASE, productionName);
  const config = {
    host: required(env.DB_BACKUP_HOST || env.DB_HOST, 'DB_BACKUP_HOST or DB_HOST'),
    port: Number(env.DB_BACKUP_PORT || env.DB_PORT || 3306),
    user: required(env.DB_BACKUP_USER || env.DB_OWNER_USER, 'DB_BACKUP_USER or DB_OWNER_USER'),
    password: required(env.DB_BACKUP_PASSWORD || env.DB_OWNER_PASSWORD, 'DB_BACKUP_PASSWORD or DB_OWNER_PASSWORD'),
    ssl: env.DB_BACKUP_SSL === 'true' || env.DB_SSL === 'true',
    sslCa: env.DB_BACKUP_SSL_CA || env.DB_SSL_CA || null,
  };
  const digest = await verifyBackup(file);
  const defaults = createDefaultsFile(config);
  try {
    const existing = await runMysql(['--batch', '--skip-column-names', '-e', `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${target}'`], defaults.file, env);
    if (Number(existing) !== 0) throw new Error(`Restore target ${target} is not empty. Use a new pre-created loop_restore_ schema.`);

    await new Promise((resolve, reject) => {
      const child = spawn(env.MYSQL_BIN || 'mysql', [`--defaults-extra-file=${defaults.file}`, '--default-character-set=utf8mb4', target], { stdio: ['pipe', 'ignore', 'pipe'], env });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`Restore import failed (${signal || `exit ${code}`}): ${stderr.trim().slice(-1800)}`)));
      pipeline(fs.createReadStream(file), createGunzip(), child.stdin).catch(reject);
    });
    const count = Number(await runMysql(['--batch', '--skip-column-names', '-e', `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${target}'`], defaults.file, env));
    if (!Number.isInteger(count) || count < 1) throw new Error(`Restore completed but target ${target} contains no tables.`);
    return { target, tables: count, sha256: digest };
  } finally {
    fs.rmSync(defaults.dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  loadEnvFile(path.resolve(__dirname, '../.env'));
  restoreDrill().then((result) => {
    console.log(`Restore drill complete: ${result.target} contains ${result.tables} table(s).`);
    console.log(`Verified backup SHA-256: ${result.sha256}`);
    console.log('This did not change DB_NAME or the production schema. Review the restored schema and run application verification against it.');
  }).catch((error) => {
    console.error(`Restore drill failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { digestFile, verifyBackup, restoreDrill };
