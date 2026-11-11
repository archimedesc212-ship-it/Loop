// Every error becomes { error: { code, message, details? } }.
// MySQL errors are translated into user-facing messages. Stack traces and
// SQL text are never sent to the client.
const ApiError = require('../utils/ApiError');

const DUPLICATES = [
  [/playlist_songs\.PRIMARY/, 'DUPLICATE_PLAYLIST_SONG', 'This song is already in the playlist.'],
  // before the generic ratings rule: "song_mood_ratings.PRIMARY" also contains "ratings.PRIMARY"
  [/song_mood_ratings\.PRIMARY/, 'DUPLICATE_MOOD_RATING', 'You have already rated this mood for this song. Update it instead.'],
  [/ratings\.PRIMARY/, 'DUPLICATE_RATING', 'You have already rated this song.'],
  [/uq_users_email/, 'EMAIL_TAKEN', 'An account with this email already exists.'],
  [/uq_users_username/, 'USERNAME_TAKEN', 'That username is taken.'],
  [/uq_playlists_user_name/, 'DUPLICATE_PLAYLIST', 'You already have a playlist with that name.'],
  [/uq_artists_identity/, 'DUPLICATE_ARTIST', 'An artist with that name already exists. Add a disambiguation to tell them apart.'],
  [/uq_songs_identity/, 'DUPLICATE_SONG', 'This artist already has a song with that title and version.'],
  [/uq_songs_isrc/, 'DUPLICATE_ISRC', 'Another song already uses that ISRC.'],
  [/uq_moods_name/, 'DUPLICATE_MOOD', 'A mood with that name already exists.'],
  [/uq_incog_one_active/, 'INCOGNITO_ACTIVE', 'A private session is already active.'],
  [/uq_jobs_idem/, 'DUPLICATE_JOB', 'This job has already been created.'],
  [/uq_mk/, 'DUPLICATE_KEYWORD', 'That phrase is already mapped to this mood.'],
  [/uq_world_one_active/, 'WORLD_CONFLICT', 'Another world became active at the same time. Try again.'],
];

function translateMysql(err) {
  const msg = err.sqlMessage || '';
  switch (err.errno) {
    case 1062: {
      const hit = DUPLICATES.find(([re]) => re.test(msg));
      return hit ? new ApiError(409, hit[1], hit[2]) : new ApiError(409, 'DUPLICATE', 'That record already exists.');
    }
    case 1451: return new ApiError(409, 'IN_USE', 'This record is still referenced elsewhere, so it cannot be deleted. Hide it instead.');
    case 1452: return new ApiError(400, 'INVALID_REFERENCE', 'A referenced record does not exist. Check the IDs you sent.');
    case 3819: {
      const name = (msg.match(/'([^']+)'/) || [])[1] || 'constraint';
      return new ApiError(400, 'CONSTRAINT_VIOLATION', `A value is outside its allowed range (${name}).`);
    }
    case 1644: { // SIGNAL SQLSTATE '45000' from a procedure or trigger
      const text = msg.endsWith('.') ? msg : `${msg}.`;
      if (/not found/i.test(msg)) return new ApiError(404, 'NOT_FOUND', text);
      if (/private session is active/i.test(msg)) return new ApiError(409, 'INCOGNITO_ACTIVE', text);
      return new ApiError(400, 'VALIDATION_ERROR', text);
    }
    case 1406: return new ApiError(400, 'VALUE_TOO_LONG', 'One of the values is too long.');
    case 1213: return new ApiError(503, 'DEADLOCK', 'The database was busy. Try again.');
    case 1205: return new ApiError(503, 'LOCK_TIMEOUT', 'The database was busy. Try again.');
    case 1142: case 1143: case 1370:
      return new ApiError(500, 'DB_PERMISSION', 'The application account lacks a database privilege.');
    default: return null;
  }
}

 
function errorHandler(err, req, res, next) {
  let e = err instanceof ApiError ? err : null;
  if (!e && err.errno) e = translateMysql(err);
  if (!e && ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ETIMEDOUT', 'ER_BAD_DB_ERROR'].includes(err.code)) {
    e = new ApiError(503, 'DATABASE_UNAVAILABLE', 'The music database is unavailable right now. Try again in a moment.');
  }
  if (!e && err.type === 'entity.parse.failed') e = ApiError.badRequest('Request body is not valid JSON.');
  if (!e && err.type === 'entity.too.large') e = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  if (!e) {
    console.error('[unhandled]', err);
    e = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on our side.');
  } else if (e.status >= 500) {
    console.error('[server]', err.sqlMessage || err.message);
  }
  const body = { error: { code: e.code, message: e.message } };
  if (e.details) body.error.details = e.details;
  res.status(e.status).json(body);
}

const notFound = (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.path}` } });

module.exports = { errorHandler, notFound, translateMysql };
