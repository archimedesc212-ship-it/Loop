'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SAFE_DB_NAME = /^[A-Za-z0-9_$-]{1,64}$/;


function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const source = fs.readFileSync(filePath, 'utf8');
  let loaded = 0;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[match[1]] = value;
    loaded += 1;
  }
  return loaded;
}

function validateDatabaseName(value, label = 'Database name') {
  const name = String(value || '');
  if (!SAFE_DB_NAME.test(name)) throw new Error(`${label} must be 1-64 characters using only letters, numbers, underscore, dollar or hyphen.`);
  return name;
}

function optionValue(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

function buildClientDefaults(config) {
  const lines = [
    '[client]',
    `host=${optionValue(config.host)}`,
    `port=${Number(config.port || 3306)}`,
    `user=${optionValue(config.user)}`,
    `password=${optionValue(config.password)}`,
    'default-character-set=utf8mb4',
  ];
  if (config.ssl) {
    lines.push('ssl-mode=VERIFY_IDENTITY');
    if (config.sslCa) lines.push(`ssl-ca=${optionValue(config.sslCa)}`);
  }
  return `${lines.join('\n')}\n`;
}

function createDefaultsFile(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-mysql-client-'));
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, 'client.cnf');
  fs.writeFileSync(file, buildClientDefaults(config), { mode: 0o600, flag: 'wx' });
  fs.chmodSync(file, 0o600);
  return { dir, file };
}

function restoreTargetName(value, productionName) {
  const name = validateDatabaseName(value, 'DB_BACKUP_RESTORE_DATABASE');
  if (name === String(productionName || '')) throw new Error('Restore drills must never target DB_NAME (the configured application database).');
  if (!name.startsWith('loop_restore_')) throw new Error('Restore target must start with loop_restore_ and must be a pre-created, empty schema.');
  return name;
}

module.exports = { loadEnvFile, validateDatabaseName, optionValue, buildClientDefaults, createDefaultsFile, restoreTargetName };
