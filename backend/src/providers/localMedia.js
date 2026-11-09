// User-provided / locally licensed audio ("USER_LOCAL" media).
// Audio files you own or are licensed to use are placed in LOCAL_MEDIA_DIR
// (default <repo>/media) and registered against a song by a curator. The API
// streams them only to signed-in users, with HTTP range support. A registered
// file that is missing on disk is reported as unavailable, never played.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const CODE = 'LOCAL_MEDIA';
const EXT = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac' };
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

const dir = () => path.resolve(cfg.localMedia.dir || path.resolve(__dirname, '../../../media'));

function check() {
  if (!cfg.localMedia.enabled) return { state: 'disabled' };
  return fs.existsSync(dir()) ? { state: 'ready', detail: `${list().length} audio file(s) available` }
    : { state: 'ready', detail: 'media folder not created yet (no local files)' };
}

/** Validate a file name and return its absolute path, or null if unsafe/unsupported. */
function resolveFile(name) {
  if (typeof name !== 'string' || !NAME.test(name) || name.includes('..')) return null;
  const ext = path.extname(name).toLowerCase();
  if (!EXT[ext]) return null;
  const full = path.join(dir(), name);
  if (path.dirname(full) !== dir()) return null;
  return { full, type: EXT[ext] };
}

function available(name) {
  if (!cfg.localMedia.enabled) return false;
  const f = resolveFile(name);
  return !!(f && fs.existsSync(f.full) && fs.statSync(f.full).isFile());
}

function list() {
  if (!fs.existsSync(dir())) return [];
  return fs.readdirSync(dir()).filter((n) => resolveFile(n) && fs.statSync(path.join(dir(), n)).isFile()).sort();
}

module.exports = { code: CODE, check, resolveFile, available, list, dir, EXT };
