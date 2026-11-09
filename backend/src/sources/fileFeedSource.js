// Approved file feeds: JSON files in database/sources/ (project-authored, CC0).
// Each record may carry pre-computed audio analysis from the partner's analyser.
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../../../database/sources');

function listFiles() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
}

/** Returns { label, records:[{externalId, entityType, payload, sourceUrl, rights}] }. */
async function discover({ file } = {}) {
  const files = file ? [file] : listFiles();
  const records = [];
  for (const f of files) {
    if (!/^[A-Za-z0-9._-]+\.json$/.test(f)) throw new Error(`Invalid feed file name: ${f}`);
    const full = path.join(DIR, f);
    if (!fs.existsSync(full)) throw new Error(`Feed file not found: ${f}`);
    const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!Array.isArray(doc.records)) throw new Error(`${f} has no "records" array`);
    for (const r of doc.records) {
      const { external_id: externalId, type, ...payload } = r;
      records.push({ externalId: String(externalId || ''), entityType: type || 'SONG', payload, sourceUrl: null, rights: 'PERMITTED', file: f });
    }
  }
  return { label: files.join(', ') || 'no files', records };
}

module.exports = { code: 'MUSE_CATALOG_FEED', discover, listFiles };
