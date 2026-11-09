// Controllers: translate HTTP (req.valid, req.user) into service calls and
// shape the response. No SQL lives here; it is all in services/ and the database.
const auth = require('../services/authService');
const onboarding = require('../services/onboardingService');
const catalog = require('../services/catalogService');
const rec = require('../services/recommendationService');
const moodParser = require('../services/moodParser');
const playback = require('../services/playbackService');
const feedback = require('../services/feedbackService');
const moodRatings = require('../services/moodRatingService');
const playlists = require('../services/playlistService');
const insights = require('../services/insightsService');
const incognito = require('../services/incognitoService');
const worlds = require('../services/worldService');
const admin = require('../services/adminService');
const review = require('../services/reviewService');
const healthSvc = require('../services/healthService');
const pipeline = require('../services/pipeline/pipelineService');
const { query, one, withTransaction, asActor } = require('../config/db');
const { toSong } = require('../services/songMapper');
const ApiError = require('../utils/ApiError');
const sessions = require('../services/sessionService');
const media = require('../services/mediaService');
const providerSvc = require('../services/providerService');
const { setSessionCookies, clearSessionCookies } = require('../middleware/auth');

const b = (req) => (req.valid && req.valid.body) || {};
const q = (req) => (req.valid && req.valid.query) || {};
const p = (req) => (req.valid && req.valid.params) || {};

// ---------------------------------------------------------------------------
const client = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });
/**
 * Browser: the session token goes only into the httpOnly cookie. API clients that
 * send `X-Auth-Mode: bearer` get the token in the body instead (no cookie).
 */
function sendSession(req, res, status, { session: s, user }) {
  const bearer = req.get('x-auth-mode') === 'bearer';
  if (!bearer) setSessionCookies(res, s);
  res.status(status).json({ user, csrfToken: bearer ? undefined : s.csrfToken, expiresAt: s.expiresAt, ...(bearer ? { token: s.token } : {}) });
}

async function meBody(req) {
  return { ...(await auth.profile(req.user.id)),
    session: { id: req.session.id, expiresAt: req.session.expiresAt, csrfToken: req.session.via === 'cookie' ? sessions.csrfFor(req.session.id) : undefined } };
}

exports.auth = {
  register: async (req, res) => sendSession(req, res, 201, await auth.register(b(req), client(req))),
  login: async (req, res) => sendSession(req, res, 200, await auth.login(b(req), client(req))),
  me: async (req, res) => res.json(await meBody(req)),
  session: async (req, res) => res.json(req.user ? { authenticated: true, ...(await meBody(req)) } : { authenticated: false }),
  logout: async (req, res) => {
    // fold the open listening session into the profile (no-op in a private session)
    const closed = req.user.incognitoId ? 0 : await playback.closeOpenSessions(req.user.id);
    await sessions.revoke(req.session.id, 'LOGOUT');
    clearSessionCookies(res);
    res.json({ ok: true, sessionsClosed: closed });
  },
  logoutAll: async (req, res) => {
    const revoked = await sessions.revokeAll(req.user.id, 'LOGOUT_ALL');
    clearSessionCookies(res);
    res.json({ ok: true, sessionsRevoked: revoked });
  },
};

exports.me = {
  sessions: async (req, res) => res.json(await sessions.list(req.user.id, req.session.id)),
  revokeSession: async (req, res) => {
    const id = p(req).sessionId;
    const own = await one('SELECT user_id FROM auth_sessions WHERE session_id = ?', [id]);
    if (!own || own.user_id !== req.user.id) throw ApiError.notFound('Session');
    await sessions.revoke(id, 'REVOKED_BY_USER');
    if (id === req.session.id) clearSessionCookies(res);
    res.json({ ok: true });
  },
  changePassword: async (req, res) => res.json(await auth.changePassword(req.user.id, req.session.id, b(req))),
  deleteAccount: async (req, res) => {
    await auth.deleteAccount(req.user.id, b(req));
    clearSessionCookies(res);
    res.json({ deleted: true });
  },
  onboardingOptions: async (req, res) => res.json(await onboarding.options(req.user.id)),
  saveOnboarding: async (req, res) => {
    await onboarding.save(req.user.id, b(req));
    res.json(await auth.profile(req.user.id));
  },
  updateSettings: async (req, res) => {
    await onboarding.updateSettings(req.user.id, b(req));
    res.json(await auth.profile(req.user.id));
  },
};

// ---------------------------------------------------------------------------
exports.catalog = {
  songs: async (req, res) => res.json(await catalog.listSongs(req.user, q(req))),
  song: async (req, res) => res.json(await catalog.songDetail(req.user, p(req).id)),
  artist: async (req, res) => res.json(await catalog.artistDetail(req.user, p(req).id)),
  artistArtwork: async (req, res) => res.json(await catalog.artistArtwork(req.user, p(req).id)),
  albumArtwork: async (req, res) => res.json(await catalog.albumArtwork(req.user, p(req).id)),
  album: async (req, res) => res.json(await catalog.albumDetail(req.user, p(req).id)),
  genres: async (req, res) => res.json(await catalog.genreTree()),
  moods: async (req, res) => res.json(await catalog.moods()),
  moodSongs: async (req, res) => {
    const m = await one('SELECT mood_id, name, emoji, color_hex, description FROM moods WHERE mood_id = ?', [p(req).id]);
    if (!m) throw new ApiError(404, 'INVALID_MOOD', 'That mood does not exist.');
    const list = await catalog.listSongs(req.user, { ...q(req), moodId: m.mood_id });
    res.json({ mood: { id: m.mood_id, name: m.name, emoji: m.emoji, color: m.color_hex, description: m.description }, ...list });
  },
  contexts: async (req, res) => res.json(await catalog.contexts()),
  languages: async (req, res) => res.json(await catalog.languages()),
  regions: async (req, res) => res.json(await catalog.regions()),
  search: async (req, res) => res.json(await catalog.search(req.user, q(req).q)),
  film: async (req, res) => res.json(await catalog.filmDetail(req.user, p(req).id)),
  language: async (req, res) => res.json(await catalog.languageDetail(req.user, p(req).id)),
  trending: async (req, res) => res.json(await catalog.trending(req.user, q(req))),
};

// ---------------------------------------------------------------------------
exports.rec = {
  mood: async (req, res) => res.json(await rec.forMood(req.user, b(req))),
  parse: async (req, res) => res.json(await moodParser.parse(b(req).text)),
  context: async (req, res) => res.json(await rec.forContext(req.user, { code: p(req).code, limit: q(req).limit })),
  daily: async (req, res) => res.json(await rec.daily(req.user, q(req))),
  similar: async (req, res) => {
    const r = await rec.similar(req.user, { seedSongId: q(req).seed, limit: q(req).limit });
    res.json(r || { strategy: 'SIMILAR', title: null, songs: [], empty: true,
      message: 'Rate a song 4★ or more, or like one, and MUSE will find songs that sound like it.' });
  },
  regional: async (req, res) => res.json(await rec.regional(req.user, q(req))),
  discovery: async (req, res) => res.json(await rec.discovery(req.user, q(req))),
  recovery: async (req, res) => res.json(await rec.recovery(req.user, q(req))),
  batch: async (req, res) => res.json(await rec.getBatch(req.user, p(req).id)),
  /** GET /api/recommendations/:userId — the user's personalised Daily Mix. */
  forUser: async (req, res) => {
    const target = p(req).userId;
    const u = target === req.user.id ? req.user : await targetUser(target);
    res.json(await rec.daily(u, q(req)));
  },
};

async function targetUser(userId) {
  const u = await one(
    `SELECT u.user_id AS id, up.region_code AS regionCode, up.content_filter AS contentFilter
       FROM users u JOIN user_profiles up USING (user_id) WHERE u.user_id = ? AND u.is_active = 1`, [userId]);
  if (!u) throw ApiError.notFound('User');
  return { ...u, incognitoId: null, permissions: new Set() };
}

// ---------------------------------------------------------------------------
exports.playback = {
  start: async (req, res) => res.status(201).json(await playback.start(req.user, b(req))),
  event: async (req, res) => res.json(await playback.event(req.user, p(req).playId, b(req))),
  finish: async (req, res) => res.json(await playback.finish(req.user, p(req).playId, b(req))),
  finishPrivate: async (req, res) => res.json(await playback.finishPrivate(req.user, b(req))),
  recent: async (req, res) => {
    const rows = await playback.recent(req.user, q(req).limit || 20);
    res.json(rows.map((r) => ({ ...toSong(r), playId: r.play_id, playedAt: r.started_at, listenedSec: r.listened_sec,
      completionPct: Number(r.completion_pct), completed: !!r.completed, skipped: !!r.skipped, replay: !!r.is_replay, origin: r.origin })));
  },
  /** POST /api/history — record a whole play in one call (start + finish in sequence). */
  record: async (req, res) => {
    const { songId, listenedSec, origin } = b(req);
    const started = await playback.start(req.user, { songId, origin });
    if (started.private) return res.status(201).json(await playback.finishPrivate(req.user, { songId, listenedSec }));
    res.status(201).json({ ...(await playback.finish(req.user, started.playId, { listenedSec })), sessionId: started.sessionId });
  },
};

// mood-wise percentage ratings: the acting user always comes from the session, never from the request
exports.moodRatings = {
  forSong: async (req, res) => res.json(await moodRatings.forSong(req.user, p(req).id)),
  create: async (req, res) => {
    const { moodId, matchPercentage, reviewText } = b(req);
    res.status(201).json(await moodRatings.save(req.user, p(req).id, [{ moodId, matchPercentage, reviewText }], 'create'));
  },
  upsertOne: async (req, res) => {
    const r = await moodRatings.save(req.user, p(req).id, [{ moodId: p(req).moodId, ...b(req) }], 'upsert');
    res.status(r.saved[0].created ? 201 : 200).json(r);
  },
  upsertMany: async (req, res) => res.json(await moodRatings.save(req.user, p(req).id, b(req).ratings, 'upsert')),
  remove: async (req, res) => res.json(await moodRatings.remove(req.user, p(req).id, p(req).moodId)),
  mine: async (req, res) => res.json(await moodRatings.mine(req.user, q(req))),
  topForMood: async (req, res) => res.json(await moodRatings.topForMood(req.user, p(req).id, q(req))),
};

exports.feedback = {
  rate: async (req, res) => res.json(await feedback.rate(req.user, p(req).id, b(req).rating, 'upsert')),
  createRating: async (req, res) => res.status(201).json(await feedback.rate(req.user, b(req).songId, b(req).rating, 'create')),
  unrate: async (req, res) => res.json(await feedback.unrate(req.user, p(req).id)),
  like: async (req, res) => res.json(await feedback.like(req.user, p(req).id, b(req).liked)),
  dismiss: async (req, res) => res.json(await feedback.dismiss(req.user, p(req).id, b(req).batchId || null)),
  undismiss: async (req, res) => res.json(await feedback.undismiss(req.user, p(req).id)),
  dismissed: async (req, res) => {
    const rows = await feedback.dismissed(req.user);
    res.json(rows.map((r) => ({ ...toSong(r), dismissedAt: r.dismissed_at })));
  },
  liked: async (req, res) => {
    const rows = await query(
      `SELECT sc.*, ul.liked_at FROM user_likes ul JOIN v_song_catalog sc ON sc.song_id = ul.song_id
        WHERE ul.user_id = ? AND sc.status = 'ACTIVE' ORDER BY ul.liked_at DESC`, [req.user.id]);
    res.json(rows.map((r) => ({ ...toSong(r), liked: true, likedAt: r.liked_at })));
  },
};

// ---------------------------------------------------------------------------
exports.playlists = {
  list: async (req, res) => res.json(await playlists.list(req.user)),
  detail: async (req, res) => res.json(await playlists.detail(req.user, p(req).id)),
  create: async (req, res) => res.status(201).json(await playlists.create(req.user, b(req))),
  saveBatch: async (req, res) => res.status(201).json(await playlists.saveBatch(req.user, b(req))),
  update: async (req, res) => res.json(await playlists.update(req.user, p(req).id, b(req))),
  remove: async (req, res) => res.json(await playlists.remove(req.user, p(req).id)),
  addSong: async (req, res) => res.status(201).json(await playlists.addSong(req.user, p(req).id, b(req).songId)),
  removeSong: async (req, res) => res.json(await playlists.removeSong(req.user, p(req).id, p(req).songId)),
  smartTypes: async (req, res) => res.json(playlists.smartTypes()),
  smart: async (req, res) => res.json(await playlists.generateSmart(req.user, p(req).type, q(req).limit)),
  saveSmart: async (req, res) => res.status(201).json(await playlists.saveSmart(req.user, p(req).type, b(req).name)),
};

exports.insights = {
  profile: async (req, res) => res.json(await insights.profile(userOf(req), q(req).days || 30)),
  activity: async (req, res) => res.json(await insights.activity(userOf(req))),
  journey: async (req, res) => res.json(await insights.moodJourney(userOf(req), q(req).period || 'weekly')),
  preferences: async (req, res) => res.json(await insights.preferences(userOf(req))),
  /** GET /api/users/:id/analytics — profile + activity + journey in one response. */
  analytics: async (req, res) => {
    const id = userOf(req);
    const [profile, activity, journey] = await Promise.all([insights.profile(id, 30), insights.activity(id), insights.moodJourney(id, 'weekly')]);
    res.json({ userId: id, profile, activity, journey });
  },
};
const userOf = (req) => p(req).id || req.user.id;

exports.incognito = {
  status: async (req, res) => res.json(await incognito.status(req.user)),
  start: async (req, res) => res.status(201).json(await incognito.start(req.user, b(req))),
  setMood: async (req, res) => res.json(await incognito.setMood(req.user, b(req).moodId)),
  end: async (req, res) => res.json(await incognito.end(req.user)),
};

exports.worlds = {
  current: async (req, res) => res.json(await worlds.current(req.user)),
  regenerate: async (req, res) => res.json(await worlds.regenerate(req.user)),
  rollback: async (req, res) => res.json(await worlds.rollback(req.user)),
  feedback: async (req, res) => res.json(await worlds.setFeedback(req.user, p(req).id, b(req).feedback)),
  clearFeedback: async (req, res) => res.json(await worlds.setFeedback(req.user, p(req).id, null)),
};

/**
 * GET /api/media/:id — streams a registered local audio file to a signed-in user
 * (HTTP range requests supported by sendFile). The content filter applies.
 */
exports.media = {
  stream: async (req, res) => {
    const f = await media.localFile(p(req).id);
    if (!playback.contentAllowed(req.user, f.song)) throw new ApiError(403, 'CONTENT_FILTERED', 'Your content filter hides this song.');
    res.set('Cache-Control', 'private, max-age=300');
    res.type(f.type);
    await new Promise((resolve, reject) => res.sendFile(f.full, { acceptRanges: true, dotfiles: 'deny' }, (err) => (err && !res.headersSent ? reject(err) : resolve())));
  },
};

// ---------------------------------------------------------------------------
const actor = (req) => req.user.id;
exports.admin = {
  overview: async (req, res) => res.json(await admin.overview()),
  stats: async (req, res) => res.json(await admin.listeningStats()),
  references: async (req, res) => res.json(await admin.references()),
  songs: async (req, res) => res.json(await admin.listSongs(q(req))),
  song: async (req, res) => res.json(await admin.songDetailAdmin(p(req).id)),
  createSong: async (req, res) => res.status(201).json(await admin.createSong(actor(req), b(req))),
  updateSong: async (req, res) => res.json(await admin.updateSong(actor(req), p(req).id, b(req))),
  deleteSong: async (req, res) => res.json(await admin.deleteSong(actor(req), p(req).id)),
  curateMood: async (req, res) => res.json(await admin.curateMood(actor(req), p(req).id, p(req).moodId, b(req))),
  clearCuration: async (req, res) => res.json(await admin.clearCuration(actor(req), p(req).id, p(req).moodId)),
  mergeSongs: async (req, res) => {
    const { duplicateSongId, canonicalSongId } = b(req);
    await asActor(actor(req), (c) => c.call('sp_merge_songs', [duplicateSongId, canonicalSongId, actor(req)]));
    res.json({ merged: duplicateSongId, into: canonicalSongId });
  },
  artists: async (req, res) => res.json(await admin.listArtists(q(req))),
  createArtist: async (req, res) => res.status(201).json(await admin.createArtist(actor(req), b(req))),
  updateArtist: async (req, res) => res.json(await admin.updateArtist(actor(req), p(req).id, b(req))),
  createAlbum: async (req, res) => res.status(201).json(await admin.createAlbum(actor(req), b(req))),
  createMood: async (req, res) => res.status(201).json(await admin.createMood(actor(req), b(req))),
  addKeyword: async (req, res) => res.status(201).json(await admin.addKeyword(actor(req), b(req))),
  users: async (req, res) => res.json(await admin.listUsers(q(req))),
  updateUser: async (req, res) => res.json(await admin.updateUser(actor(req), p(req).id, b(req))),
  models: async (req, res) => res.json(await admin.models()),
  setParam: async (req, res) => res.json(await admin.setParam(actor(req), p(req).id, p(req).code, b(req).value)),
  activateModel: async (req, res) => res.json(await admin.activateModel(actor(req), p(req).id)),
  audit: async (req, res) => res.json(await admin.auditLog(q(req))),
  reviews: async (req, res) => res.json(await review.list(q(req))),
  decide: async (req, res) => res.json(await review.decide(actor(req), p(req).id, b(req))),
  health: async (req, res) => res.json(await healthSvc.health()),
  performance: async (req, res) => res.json(await healthSvc.performanceLab()),
  // pipeline
  sources: async (req, res) => res.json(await query(
    `SELECT ms.source_id AS id, ms.code, ms.name, ms.source_type AS type, ms.access_method AS access, ms.license_name AS license,
            ms.rights_scope AS rights, ms.requires_attribution AS requiresAttribution, ms.attribution_text AS attribution,
            ms.priority, fb.code AS fallback, ms.is_enabled AS enabled, ms.requires_credentials AS needsCredentials,
            ms.last_success_at AS lastSuccessAt, ms.notes, dq.records, dq.completed, dq.failed, dq.in_review AS inReview, dq.avg_quality AS avgQuality
       FROM music_sources ms LEFT JOIN music_sources fb ON fb.source_id = ms.fallback_source_id
       LEFT JOIN v_data_quality dq ON dq.source_id = ms.source_id ORDER BY ms.priority`)),
  updateSource: async (req, res) => {
    const { enabled, priority } = b(req);
    await withTransaction(async (tx) => {
      const s = await tx.one('SELECT source_id FROM music_sources WHERE code = ? FOR UPDATE', [p(req).code]);
      if (!s) throw ApiError.notFound('Source');
      if (enabled !== undefined) await tx.query('UPDATE music_sources SET is_enabled = ? WHERE source_id = ?', [enabled ? 1 : 0, s.source_id]);
      if (priority !== undefined) await tx.query('UPDATE music_sources SET priority = ? WHERE source_id = ?', [priority, s.source_id]);
    }, { actorId: actor(req) });
    res.json({ ok: true });
  },
  jobs: async (req, res) => res.json(await query(
    `SELECT j.job_id AS id, j.job_type AS type, j.status, j.parent_job_id AS parentId, ms.code AS source, j.idempotency_key AS idempotencyKey,
            j.retry_count AS retries, j.max_retries AS maxRetries, j.processing_version AS version, j.stats, j.last_error AS error,
            j.created_at AS createdAt, j.started_at AS startedAt, j.completed_at AS completedAt, up.display_name AS requestedBy,
            TIMESTAMPDIFF(SECOND, j.started_at, j.completed_at) AS durationSec
       FROM pipeline_jobs j LEFT JOIN music_sources ms ON ms.source_id = j.source_id
       LEFT JOIN user_profiles up ON up.user_id = j.requested_by
      ORDER BY j.job_id DESC LIMIT ?`, [q(req).limit || 40])),
  job: async (req, res) => {
    const job = await one('SELECT * FROM pipeline_jobs WHERE job_id = ?', [p(req).id]);
    if (!job) throw ApiError.notFound('Job');
    const logs = await query(
      `SELECT log_id AS id, level, stage, message, record_id AS recordId, created_at AS at FROM pipeline_job_logs
        WHERE job_id = ? ORDER BY log_id`, [p(req).id]);
    const children = await query('SELECT job_id AS id, job_type AS type, status FROM pipeline_jobs WHERE parent_job_id = ? ORDER BY job_id', [p(req).id]);
    res.json({ job, logs, children });
  },
  ingest: async (req, res) => res.json(await pipeline.runIngest({ ...b(req), requestedBy: actor(req) })),
  weekly: async (req, res) => res.json(await pipeline.runWeeklyIntelligence({ requestedBy: actor(req), force: !!b(req).force, reason: 'admin' })),
  trends: async (req, res) => res.json(await pipeline.runTrendSnapshot({ requestedBy: actor(req), key: `trend:manual:${Date.now()}` })),
  providers: async (req, res) => res.json(await providerSvc.status()),
  testProvider: async (req, res) => res.json(await providerSvc.test(p(req).code)),
  enrichFilm: async (req, res) => res.json(await providerSvc.enrichFilm(p(req).id, b(req))),
  videoLinks: async (req, res) => res.json(await providerSvc.findVideoLinks(p(req).id)),
  films: async (req, res) => res.json(await query(
    `SELECT f.film_id AS id, f.title, f.release_year AS releaseYear, l.name AS language,
            (SELECT COUNT(*) FROM albums al WHERE al.film_id = f.film_id) AS albums,
            (SELECT sr.external_id FROM source_records sr JOIN music_sources ms ON ms.source_id = sr.source_id
              WHERE sr.film_id = f.film_id AND ms.code = 'TMDB' LIMIT 1) AS tmdbId
       FROM films f JOIN languages l ON l.language_id = f.language_id ORDER BY f.release_year DESC, f.title`)),
  media: async (req, res) => res.json({ summary: await media.summary(), localFiles: require('../providers').localMedia.list() }),
  checkMedia: async (req, res) => res.json(await media.checkLocal()),
  registerMedia: async (req, res) => res.status(201).json(await media.registerLocal(p(req).id, b(req).fileName, b(req))),
  feedFiles: async (req, res) => res.json(require('../sources/fileFeedSource').listFiles()),
};
