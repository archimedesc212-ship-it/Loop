// Readiness: can this instance serve real traffic? Checks the database, that the
// schema is at the version the code expects, and each provider's configuration
// state. Never includes secrets, hostnames or connection strings.
const { one, query } = require('../config/db');
const { files } = require('../../scripts/migrate');
const providers = require('../providers');

function expectedVersion() {
  const all = files();
  return all.length ? all[all.length - 1].version : '0000';
}

async function check() {
  const expected = expectedVersion();
  const out = { status: 'ready', database: 'up', schema: { expected, current: null }, providers: [] };
  try {
    const r = await one('SELECT MAX(version) AS v FROM schema_migrations');
    out.schema.current = r ? r.v : null;
    const s = await one("SELECT COUNT(*) AS n FROM songs WHERE status = 'ACTIVE'");
    out.catalogue = { activeSongs: s.n };
    const playable = await query("SELECT COUNT(*) AS n FROM v_song_playback p JOIN songs s ON s.song_id = p.song_id AND s.status = 'ACTIVE'");
    out.catalogue.playableSongs = playable[0].n;
  } catch (err) {
    out.status = 'not_ready';
    out.database = err.errno === 1146 || err.errno === 1142 ? 'up' : 'down';
    if (out.database === 'up') out.schema.problem = 'migration history unreadable — run npm run db:migrate';
    return out;
  }
  if (out.schema.current !== expected) {
    out.status = 'not_ready';
    out.schema.problem = out.schema.current < expected
      ? 'database schema is behind the code — run npm run db:migrate'
      : 'database schema is newer than this code — deploy the matching release';
  }
  out.providers = providers.status().map((p) => ({ code: p.code, state: p.state, ...(p.missing ? { missing: p.missing } : {}) }));
  return out;
}

module.exports = { check, expectedVersion };
