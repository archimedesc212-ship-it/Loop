// Every route: authentication → authorisation → input validation → controller.
// Validation schemas are declared next to the route so the contract is visible.
const express = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers');
const h = require('../utils/asyncHandler');
const { requireAuth, optionalAuth, requirePermission, requireSelfOr } = require('../middleware/auth');
const { rules: r, optional: opt, validate: v, idParam } = require('../utils/validate');
const { nodeEnv, rateLimits } = require('../config/env');

const router = express.Router();
const id = idParam('id');
const limitQ = { limit: opt(r.int(1, 100)) };

// Failed sign-in / registration attempts per client IP per 15 minutes (successful ones
// are not counted). Per-account lockout (5 wrong passwords) is separate, in authService.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: nodeEnv === 'test' ? 1000 : rateLimits.authFailuresPer15Min, skipSuccessfulRequests: true,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts from this network. Wait a few minutes.' } },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, limit: nodeEnv === 'test' ? 5000 : rateLimits.writesPerMinute, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Slow down a little and try again.' } },
});

// ---------------------------------------------------------------- auth
const PASSWORD = r.str(8, 72, /^(?=.*[A-Za-z])(?=.*\d).+$/, 'needs at least one letter and one number');
router.post('/auth/register', optionalAuth, loginLimiter, v({
  username: r.str(3, 30, /^[a-z0-9_]+$/, 'may use lowercase letters, digits and _ only'),
  email: r.email(),
  password: PASSWORD,
  displayName: r.str(1, 60),
}), h(c.auth.register));
router.post('/auth/login', loginLimiter, v({ login: r.str(3, 120), password: r.str(1, 72) }), h(c.auth.login));

// The session check is read-only. Guest creation is an explicit, rate-limited POST.
const guestSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: nodeEnv === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => !!req.user,
  message: { error: { code: 'GUEST_LIMITED', message: 'Too many new guest sessions from this network. Please try again later.' } },
});
router.get('/auth/session', optionalAuth, h(c.auth.session));
router.post('/auth/session', optionalAuth, guestSessionLimiter, h(c.auth.createGuestSession));


router.use(requireAuth);

// Live read-only MySQL object counts for the academic DBMS explorer.
router.get('/database/summary', h(c.databaseSummary));

// Worldwide provider search (credentials stay on the API server).
router.get('/music/jamendo', v({ q: r.str(2, 120), limit: opt(r.int(1, 30), 12) }, 'query'), h(c.music.jamendoSearch));
router.get('/music/youtube', v({ q: r.str(2, 120), limit: opt(r.int(1, 20), 10) }, 'query'), h(c.music.youtubeSearch));
router.get('/music/musicbrainz', v({ q: r.str(2, 120), limit: opt(r.int(1, 12), 8) }, 'query'), h(c.music.musicbrainzSearch));
router.get('/music/cover-art', v({ mbid: r.str(36, 36, /^[0-9a-f-]{36}$/i) }, 'query'), h(c.music.coverArt));

router.use((req, res, next) => (req.method === 'GET' ? next() : writeLimiter(req, res, next)));

// Spotify catalogue metadata is fetched on demand using a listener's PKCE token.
// Only search queries and Spotify track identifiers are recorded in MySQL.
router.post('/music/spotify/search', v({ q: r.str(2, 120), limit: opt(r.int(1, 20), 12), market: opt(r.str(2, 2, /^[A-Z]{2}$/), 'IN'), logSearch: opt(r.bool(), true) }), h(c.music.spotifySearch));
router.post('/music/spotify/events', v({ spotifyTrackId: r.str(10, 32, /^[A-Za-z0-9]{10,32}$/) }), h(c.music.spotifyEmbedOpened));

router.get('/auth/me', h(c.auth.me));
router.post('/auth/logout', h(c.auth.logout));
router.post('/auth/logout-all', h(c.auth.logoutAll));

// ---------------------------------------------------------------- account
router.get('/me/sessions', h(c.me.sessions));
router.delete('/me/sessions/:sessionId', v({ sessionId: r.str(16, 16, /^[0-9a-f]{16}$/) }, 'params'), h(c.me.revokeSession));
router.get('/me/mood-diary', v({ days: opt(r.int(1, 365), 90), asOfDate: opt(r.date()) }, 'query'), h(c.me.moodDiary));
router.put('/me/mood-diary/today', v({ checkinDate: r.date(), moodId: opt(r.int(1, 65535)), note: opt(r.str(0, 500)) }), h(c.me.saveMoodDiaryToday));
router.delete('/me/mood-diary/:entryId', v({ entryId: r.int(1, Number.MAX_SAFE_INTEGER) }, 'params'), h(c.me.removeMoodDiaryEntry));
router.post('/me/password', v({ currentPassword: r.str(1, 72), newPassword: PASSWORD }), h(c.me.changePassword));
router.post('/me/export', v({ password: r.str(1, 72) }), h(c.me.exportData));
router.delete('/me', v({ password: r.str(1, 72), confirm: r.oneOf(['DELETE']) }), h(c.me.deleteAccount));

// ---------------------------------------------------------------- onboarding & settings
const idList = (max) => r.arrayOf(r.int(1, 2 ** 31), max);
router.get('/me/onboarding', h(c.me.onboardingOptions));
router.post('/me/onboarding', v({
  languageIds: r.arrayOf(r.int(1, 65535), 5, 1),
  regionCode: opt(r.str(2, 6, /^[A-Z]{2}(-[A-Z]{2,3})?$/)),
  genreIds: opt(idList(6), []),
  artistIds: opt(idList(8), []),
  composerIds: opt(idList(4), []),
  moodIds: opt(idList(5), []),
  contextCodes: opt(r.arrayOf(r.str(2, 20, /^[A-Z_]+$/), 4), []),
  listeningHabit: opt(r.oneOf(['BACKGROUND', 'ACTIVE', 'MIXED'])),
  contentFilter: opt(r.oneOf(['OFF', 'NO_EXPLICIT', 'FAMILY'])),
}), h(c.me.saveOnboarding));
router.patch('/me/settings', v({
  displayName: opt(r.str(1, 60)),
  regionCode: opt(r.str(2, 6, /^[A-Z]{2}(-[A-Z]{2,3})?$/)),
  languageIds: opt(r.arrayOf(r.int(1, 65535), 5)),
  contentFilter: opt(r.oneOf(['OFF', 'NO_EXPLICIT', 'FAMILY'])),
  listeningHabit: opt(r.oneOf(['BACKGROUND', 'ACTIVE', 'MIXED'])),
}), h(c.me.updateSettings));

// ---------------------------------------------------------------- independent artist studio
const uploadId = v({ id: r.str(32, 32, /^[a-f0-9]{32}$/) }, 'params');
router.get('/artist/me', h(c.artist.me));
router.post('/artist/applications', v({
  stageName: r.str(1, 100), artistType: opt(r.oneOf(['SOLO', 'GROUP', 'COMPOSER', 'ORCHESTRA']), 'SOLO'),
  countryCode: opt(r.str(2, 2, /^[A-Z]{2}$/), 'IN'), bio: opt(r.str(0, 400)),
  websiteUrl: opt(r.str(9, 255, /^https:\/\//i)), proofUrl: opt(r.str(9, 500, /^https:\/\//i)),
}), h(c.artist.apply));
router.post('/artist/uploads', requirePermission('artist.upload'), v({
  artistId: r.int(1, 2 ** 31), title: r.str(1, 150), versionLabel: opt(r.str(0, 40), ''),
  genreId: r.int(1, 65535), languageId: opt(r.int(1, 65535)), durationSec: r.int(30, 1800),
  releaseYear: r.int(1900, 2100), explicit: opt(r.bool(), false), fileSize: r.int(1, 52428800),
  mimeType: r.str(1, 100), compositionRights: r.oneOf(['OWNED', 'LICENSED', 'PUBLIC_DOMAIN']),
  recordingRights: r.oneOf(['OWNED', 'LICENSED', 'PUBLIC_DOMAIN']),
  rightsEvidenceRef: opt(r.str(9, 500, /^https:\/\//i)),
  territories: opt(r.arrayOf(r.str(2, 10, /^(WORLDWIDE|[A-Z]{2})$/), 50, 1), ['WORLDWIDE']),
  licenceStart: opt(r.date()), licenceEnd: opt(r.date()), royaltySharePct: opt(r.decimal(0, 100, 2), 0),
  royaltyCurrency: opt(r.str(3, 3, /^[A-Z]{3}$/), 'INR'), rightsAccepted: r.bool(),
}), h(c.artist.createUpload));
router.put('/artist/uploads/:id/content', requirePermission('artist.upload'), uploadId, h(c.artist.uploadContent));
router.post('/artist/uploads/:id/withdraw', requirePermission('artist.upload'), uploadId, h(c.artist.withdraw));
router.post('/artist/uploads/:id/reports', uploadId, v({
  reportType: r.oneOf(['COPYRIGHT', 'IMPERSONATION', 'EXPLICIT_CONTENT', 'MISLABELLED', 'SAFETY', 'OTHER']),
  details: r.str(10, 2000), evidenceRef: opt(r.str(9, 500, /^https:\/\//i)),
}), h(c.artist.report));

// ---------------------------------------------------------------- catalogue & search
const listQ = {
  genreId: opt(r.int(1, 65535)), moodId: opt(r.int(1, 65535)), languageId: opt(r.int(0, 65535)),
  page: opt(r.int(1, 1000), 1), pageSize: opt(r.int(1, 60), 24), sort: opt(r.oneOf(['popular', 'newest', 'title']), 'popular'),
};
router.get('/songs', v(listQ, 'query'), h(c.catalog.songs));
router.get('/songs/:id', id, h(c.catalog.song));
router.get('/artists/:id', id, h(c.catalog.artist));
router.get('/artists/:id/artwork', id, h(c.catalog.artistArtwork));
router.get('/albums/:id/artwork', id, h(c.catalog.albumArtwork));
router.get('/albums/:id', id, h(c.catalog.album));
router.get('/genres', h(c.catalog.genres));
router.get('/moods', h(c.catalog.moods));
router.get('/moods/:id/songs', id, v({ page: opt(r.int(1, 1000), 1), pageSize: opt(r.int(1, 60), 24), sort: opt(r.oneOf(['popular', 'newest', 'title']), 'popular') }, 'query'), h(c.catalog.moodSongs));
router.get('/contexts', h(c.catalog.contexts));
router.get('/languages', h(c.catalog.languages));
router.get('/regions', h(c.catalog.regions));
router.get('/films/:id', id, h(c.catalog.film));
router.get('/languages/:id', id, h(c.catalog.language));
router.get('/search/suggest', v({ q: r.str(2, 80) }, 'query'), h(c.catalog.searchSuggest));
router.get('/search', v({ q: r.str(1, 80) }, 'query'), h(c.catalog.search));
router.get('/trending', v({
  window: opt(r.oneOf(['24H', '7D', '30D']), '7D'), entity: opt(r.oneOf(['SONG', 'ARTIST', 'GENRE', 'MOOD', 'LANGUAGE']), 'SONG'),
  region: opt(r.str(2, 6, /^[A-Z]{2}(-[A-Z]{2,3})?$/), null), limit: opt(r.int(1, 50), 12),
}, 'query'), h(c.catalog.trending));

// ---------------------------------------------------------------- recommendations
router.post('/recommendations/mood', v({
  moodIds: opt(r.arrayOf(r.int(1, 65535), 4), []),
  moodWeights: opt(r.arrayOf(r.object({ moodId: r.int(1, 65535), weight: r.decimal(0.01, 100, 2) }), 4, 1)),
  text: opt(r.str(2, 280)),
  contextCode: opt(r.str(2, 20, /^[A-Z_]+$/)),
  limit: opt(r.int(1, 50), 20),
}), h(c.rec.mood));
router.post('/recommendations/dial', v({ energy: r.num(0, 1), valence: r.num(0, 1), limit: opt(r.int(1, 50), 20) }), h(c.rec.dial));
router.post('/recommendations/journey', v({ startMoodId: r.int(1, 65535), targetMoodId: r.int(1, 65535),
  steps: opt(r.int(3, 5), 4), perStage: opt(r.int(3, 10), 5),
}), h(c.rec.journey));
router.post('/recommendations/parse', v({ text: r.str(1, 280) }), h(c.rec.parse));
router.get('/recommendations/context/:code', v({ code: r.str(2, 20, /^[A-Z_]+$/) }, 'params'), v(limitQ, 'query'), h(c.rec.context));
router.get('/recommendations/daily', v(limitQ, 'query'), h(c.rec.daily));
router.get('/recommendations/similar', v({ seed: opt(r.int(1, 2 ** 31)), ...limitQ }, 'query'), h(c.rec.similar));
router.get('/recommendations/regional', v({ languageId: opt(r.int(1, 65535)), ...limitQ }, 'query'), h(c.rec.regional));
router.get('/recommendations/discovery', v({ ...limitQ, intensity: opt(r.int(0, 100), 50) }, 'query'), h(c.rec.discovery));
router.get('/recommendations/recovery', v(limitQ, 'query'), h(c.rec.recovery));
router.get('/recommendations/batches/:id', id, h(c.rec.batch));
router.post('/recommendations/batches/:id/rebuild', id, h(c.rec.rebuildBatch));
router.get('/recommendations/:userId', v({ userId: r.int(1, 2 ** 31) }, 'params'), requireSelfOr('users.manage', 'userId'),
  v(limitQ, 'query'), h(c.rec.forUser));

// ---------------------------------------------------------------- playback & history
const ORIGIN = r.oneOf(['HOME', 'MOOD', 'CONTEXT', 'WORLD', 'SEARCH', 'PLAYLIST', 'LIBRARY', 'SMART_PLAYLIST']);
router.post('/playback/start', v({
  songId: r.int(1, 2 ** 31), origin: opt(ORIGIN, 'HOME'), batchId: opt(r.int(1, 2 ** 53)), contextCode: opt(r.str(2, 20, /^[A-Z_]+$/)),
}), h(c.playback.start));
router.post('/playback/:playId/events', v({ playId: r.int(1, 2 ** 53) }, 'params'), v({
  type: r.oneOf(['PAUSE', 'RESUME', 'SEEK']), positionSec: r.int(0, 1800), seekToSec: opt(r.int(0, 1800)),
}), h(c.playback.event));
router.post('/playback/:playId/finish', v({ playId: r.int(1, 2 ** 53) }, 'params'), v({
  listenedSec: r.int(0, 1800), positionSec: opt(r.int(0, 1800)),
}), h(c.playback.finish));
router.post('/playback/private', v({ songId: r.int(1, 2 ** 31), listenedSec: r.int(0, 1800) }), h(c.playback.finishPrivate));
router.get('/history', v(limitQ, 'query'), h(c.playback.recent));
router.post('/history', v({ songId: r.int(1, 2 ** 31), listenedSec: r.int(0, 1800), origin: opt(ORIGIN, 'HOME') }), h(c.playback.record));

// Lyrics are stored only when the contributor confirms rights; annotations and notes are private by default.
router.get('/songs/:id/lyrics', id, h(c.lyrics.get));
router.put('/songs/:id/lyrics', id, v({
  languageCode: opt(r.str(2, 12, /^[a-zA-Z-]+$/), 'und'),
  sourceType: r.oneOf(['USER_PROVIDED', 'LICENSED']),
  sourceLabel: r.str(2, 160), sourceUrl: opt(r.str(0, 500, /^https:\/\//i)),
  rightsConfirmed: r.bool(),
  lines: r.arrayOf(r.object({ startMs: r.int(0, 1800000), endMs: opt(r.int(0, 1800000)), text: r.str(1, 1000) }), 500, 1),
}), h(c.lyrics.save));
router.post('/songs/:id/lyrics/annotations', id, v({
  lineId: r.int(1, Number.MAX_SAFE_INTEGER), text: r.str(1, 2000), sourceUrl: opt(r.str(0, 500, /^https:\/\//i)),
}), h(c.lyrics.annotate));
router.delete('/lyrics/annotations/:annotationId', v({ annotationId: r.int(1, Number.MAX_SAFE_INTEGER) }, 'params'), h(c.lyrics.deleteAnnotation));
router.put('/songs/:id/notes', id, v({ text: opt(r.str(0, 5000), '') }), h(c.lyrics.saveNote));

// ---------------------------------------------------------------- ratings & likes
router.post('/ratings', v({ songId: r.int(1, 2 ** 31), rating: r.int(1, 5) }), h(c.feedback.createRating));
router.put('/songs/:id/rating', id, v({ rating: r.int(1, 5) }), h(c.feedback.rate));
router.delete('/songs/:id/rating', id, h(c.feedback.unrate));
router.put('/songs/:id/like', id, v({ liked: r.bool() }), h(c.feedback.like));
router.get('/likes', h(c.feedback.liked));
router.put('/songs/:id/dismiss', id, v({ batchId: opt(r.int(1, 2 ** 53)) }), h(c.feedback.dismiss));
router.delete('/songs/:id/dismiss', id, h(c.feedback.undismiss));
router.get('/me/dismissals', h(c.feedback.dismissed));

// ---------------------------------------------------------------- mood-wise percentage ratings (0–100)
// A user's judgement of how well a song fits a mood. Kept separate from the AI's song_moods.confidence.
const PCT = r.decimal(0, 100, 2);
const REVIEW = opt(r.str(1, 280));
const songMood = v({ id: r.int(1, 2 ** 31), moodId: r.int(1, 65535) }, 'params');
router.get('/songs/:id/mood-ratings', id, h(c.moodRatings.forSong));
router.post('/songs/:id/mood-ratings', id, v({ moodId: r.int(1, 65535), matchPercentage: PCT, reviewText: REVIEW }), h(c.moodRatings.create));
router.put('/songs/:id/mood-ratings', id, v({
  ratings: r.arrayOf(r.object({ moodId: r.int(1, 65535), matchPercentage: PCT, reviewText: REVIEW }), 50, 1),
}), h(c.moodRatings.upsertMany));
router.put('/songs/:id/mood-ratings/:moodId', songMood, v({ matchPercentage: PCT, reviewText: REVIEW }), h(c.moodRatings.upsertOne));
router.delete('/songs/:id/mood-ratings/:moodId', songMood, h(c.moodRatings.remove));
router.get('/me/mood-ratings', v({ songId: opt(r.int(1, 2 ** 31)), page: opt(r.int(1, 1000), 1), pageSize: opt(r.int(1, 100), 50) }, 'query'),
  h(c.moodRatings.mine));
router.get('/moods/:id/top-rated', id, v({
  page: opt(r.int(1, 1000), 1), limit: opt(r.int(1, 50), 20), minRatings: opt(r.int(1, 1000), 1),
  rank: opt(r.oneOf(['average', 'adjusted']), 'average'), prior: opt(r.int(0, 100), 5), includeUnrated: opt(r.bool(), false),
}, 'query'), h(c.moodRatings.topForMood));

// ---------------------------------------------------------------- media (licensed local files)
router.get('/media/:id', id, h(c.media.stream));

// ---------------------------------------------------------------- playlists
const SMART_TYPE = v({ type: r.oneOf(['ENERGY_BOOST', 'CALM_MIX', 'LATE_NIGHT', 'STUDY', 'ROAD_TRIP', 'MOST_REPLAYED', 'DISCOVERY', 'REGIONAL']) }, 'params');
router.get('/playlists', h(c.playlists.list));
router.post('/playlists', v({ name: r.str(1, 80), description: opt(r.str(0, 255)), songIds: opt(r.arrayOf(r.int(1, 2 ** 31), 200), []) }), h(c.playlists.create));
router.post('/playlists/from-batch', v({ batchId: r.int(1, 2 ** 53), name: r.str(1, 80), description: opt(r.str(0, 255)),
  smartType: opt(r.str(2, 30, /^[A-Z_]+$/)) }), h(c.playlists.saveBatch));
router.get('/playlists/smart', h(c.playlists.smartTypes));
router.get('/playlists/smart/:type', SMART_TYPE, v(limitQ, 'query'), h(c.playlists.smart));
router.post('/playlists/smart/:type', SMART_TYPE, v({ name: opt(r.str(1, 80)) }), h(c.playlists.saveSmart));
router.get('/playlists/:id', id, h(c.playlists.detail));
router.patch('/playlists/:id', id, v({ name: opt(r.str(1, 80)), description: opt(r.str(0, 255)) }), h(c.playlists.update));
router.delete('/playlists/:id', id, h(c.playlists.remove));
router.put('/playlists/:id/order', id, v({ songIds: r.arrayOf(r.int(1, 2 ** 31), 200) }), h(c.playlists.reorder));
router.post('/playlists/:id/songs', id, v({ songId: r.int(1, 2 ** 31) }), h(c.playlists.addSong));
router.delete('/playlists/:id/songs/:songId', v({ id: r.int(1, 2 ** 31), songId: r.int(1, 2 ** 31) }, 'params'), h(c.playlists.removeSong));

// ---------------------------------------------------------------- insights
const daysQ = v({ days: opt(r.int(1, 365), 30) }, 'query');
const periodQ = v({ period: opt(r.oneOf(['daily', 'weekly', 'monthly']), 'weekly') }, 'query');
const skipDaysQ = v({ days: opt(r.int(7, 365), 30) }, 'query');
router.get('/insights/profile', daysQ, h(c.insights.profile));
router.get('/insights/activity', h(c.insights.activity));
router.get('/insights/calendar', v({ days: opt(r.int(1, 365), 365) }, 'query'), h(c.insights.calendar));
router.get('/insights/journey', periodQ, h(c.insights.journey));
router.get('/insights/skip-patterns', skipDaysQ, h(c.insights.skipPatterns));
router.get('/insights/preferences', h(c.insights.preferences));
router.get('/users/:id/analytics', id, requireSelfOr('users.manage'), h(c.insights.analytics));
router.get('/users/:id/preferences', id, requireSelfOr('users.manage'), h(c.insights.preferences));

// ---------------------------------------------------------------- private sessions & worlds
router.get('/incognito', h(c.incognito.status));
router.post('/incognito', v({ moodId: opt(r.int(1, 65535)) }), h(c.incognito.start));
router.put('/incognito/mood', v({ moodId: r.int(1, 65535) }), h(c.incognito.setMood));
router.delete('/incognito', h(c.incognito.end));
router.get('/worlds/current', h(c.worlds.current));
router.post('/worlds/current/regenerate', h(c.worlds.regenerate));
router.post('/worlds/current/rollback', h(c.worlds.rollback));
router.put('/worlds/:id/feedback', id, v({ feedback: r.oneOf(['LOVE', 'NOT_FOR_ME']) }), h(c.worlds.feedback));
router.delete('/worlds/:id/feedback', id, h(c.worlds.clearFeedback));

// ---------------------------------------------------------------- admin
const A = express.Router();
const can = requirePermission;
const HEX = r.hex();
const UNIT = r.num(0, 1);
A.get('/overview', can('health.view'), h(c.admin.overview));
A.get('/permissions', can('health.view'), h(c.admin.permissionMatrix));
A.get('/migrations', can('health.view'), h(c.admin.migrations));
A.get('/stats', can('health.view'), h(c.admin.stats));
A.get('/references', can('catalog.write'), h(c.admin.references));
A.get('/songs', can('catalog.write'), v({ q: opt(r.str(0, 80), ''), status: opt(r.oneOf(['ACTIVE', 'PENDING_ANALYSIS', 'HIDDEN', 'MERGED'])),
  page: opt(r.int(1, 1000), 1), pageSize: opt(r.int(1, 100), 25) }, 'query'), h(c.admin.songs));
A.get('/songs/:id', can('catalog.write'), id, h(c.admin.song));
A.post('/songs', can('catalog.write'), v({
  title: r.str(1, 150), versionLabel: opt(r.str(0, 40), ''), artistId: r.int(1, 2 ** 31), albumId: opt(r.int(1, 2 ** 31)),
  trackNumber: opt(r.int(1, 99)), genreId: r.int(1, 65535), durationSec: r.int(30, 1800), releaseYear: r.int(1900, 2100),
  languageId: opt(r.int(1, 65535)), isrc: opt(r.str(12, 12, /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/, 'must be a 12-character ISRC like INABC2600001')),
  explicit: opt(r.bool(), false), contentRating: opt(r.oneOf(['ALL', 'TEEN', 'MATURE']), 'ALL'), popularity: opt(r.int(0, 100), 50),
  features: opt(r.object({
    energy: UNIT, valence: UNIT, danceability: UNIT, acousticness: UNIT, instrumentalness: UNIT, speechiness: UNIT,
    tempo_bpm: r.num(40, 220), loudness_db: opt(r.num(-60, 0), -8), key: opt(r.int(0, 11), 0), mode: opt(r.int(0, 1), 1),
  })),
}), h(c.admin.createSong));
A.patch('/songs/:id', can('catalog.write'), id, v({
  title: opt(r.str(1, 150)), versionLabel: opt(r.str(0, 40)), albumId: opt(r.int(1, 2 ** 31)), durationSec: opt(r.int(30, 1800)),
  releaseYear: opt(r.int(1900, 2100)), languageId: opt(r.int(1, 65535)), isrc: opt(r.str(12, 12, /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/)),
  explicit: opt(r.bool()), contentRating: opt(r.oneOf(['ALL', 'TEEN', 'MATURE'])), popularity: opt(r.int(0, 100)),
  status: opt(r.oneOf(['ACTIVE', 'HIDDEN'])), genreId: opt(r.int(1, 65535)),
}), h(c.admin.updateSong));
A.delete('/songs/:id', can('catalog.write'), id, h(c.admin.deleteSong));
A.put('/songs/:id/moods/:moodId', can('catalog.write'), v({ id: r.int(1, 2 ** 31), moodId: r.int(1, 65535) }, 'params'),
  v({ action: r.oneOf(['ADD', 'REMOVE']), confidence: opt(r.num(0.05, 1)), note: opt(r.str(0, 200)) }), h(c.admin.curateMood));
A.delete('/songs/:id/moods/:moodId', can('catalog.write'), v({ id: r.int(1, 2 ** 31), moodId: r.int(1, 65535) }, 'params'), h(c.admin.clearCuration));
A.post('/songs/merge', can('catalog.merge'), v({ duplicateSongId: r.int(1, 2 ** 31), canonicalSongId: r.int(1, 2 ** 31) }), h(c.admin.mergeSongs));
A.get('/artists', can('catalog.write'), v({ q: opt(r.str(0, 80), '') }, 'query'), h(c.admin.artists));
A.post('/artists', can('catalog.write'), v({
  name: r.str(1, 100), disambiguation: opt(r.str(0, 80), ''), type: opt(r.oneOf(['SOLO', 'GROUP', 'COMPOSER', 'ORCHESTRA']), 'SOLO'),
  countryCode: opt(r.str(2, 2, /^[A-Z]{2}$/), 'IN'), regionCode: opt(r.str(2, 6, /^[A-Z]{2}(-[A-Z]{2,3})?$/)),
  languageId: opt(r.int(1, 65535)), formedYear: opt(r.int(1900, 2100)), bio: opt(r.str(0, 400)), aliases: opt(r.arrayOf(r.str(1, 100), 10), []),
}), h(c.admin.createArtist));
A.patch('/artists/:id', can('catalog.write'), id, v({
  name: opt(r.str(1, 100)), disambiguation: opt(r.str(0, 80)), type: opt(r.oneOf(['SOLO', 'GROUP', 'COMPOSER', 'ORCHESTRA'])),
  regionCode: opt(r.str(2, 6, /^[A-Z]{2}(-[A-Z]{2,3})?$/)), languageId: opt(r.int(1, 65535)), formedYear: opt(r.int(1900, 2100)), bio: opt(r.str(0, 400)),
}), h(c.admin.updateArtist));
A.post('/albums', can('catalog.write'), v({
  title: r.str(1, 150), albumType: opt(r.oneOf(['ALBUM', 'EP', 'SINGLE', 'SOUNDTRACK', 'COMPILATION']), 'ALBUM'),
  filmId: opt(r.int(1, 2 ** 31)), releaseYear: r.int(1900, 2100), languageId: opt(r.int(1, 65535)),
  coverColor1: HEX, coverColor2: HEX, artistIds: r.arrayOf(r.int(1, 2 ** 31), 6, 1),
}), h(c.admin.createAlbum));
A.post('/moods', can('catalog.write'), v({
  name: r.str(2, 30, /^[A-Za-z][A-Za-z -]*$/, 'may only contain letters, spaces and hyphens'), emoji: r.str(1, 8), colorHex: HEX,
  description: r.str(4, 200), categoryId: r.int(1, 4), energy: UNIT, valence: UNIT, danceability: UNIT, acousticness: UNIT,
  instrumentalness: UNIT, tempoMin: r.num(40, 219), tempoMax: r.num(41, 220), reanalyze: opt(r.bool(), true),
}), h(c.admin.createMood));
A.post('/mood-keywords', can('catalog.write'), v({ phrase: r.str(2, 60, /^[\p{L}\p{N}' -]+$/u), moodId: r.int(1, 65535), weight: opt(r.num(0.05, 1), 1) }), h(c.admin.addKeyword));
A.get('/users', can('users.manage'), v({ q: opt(r.str(0, 80), '') }, 'query'), h(c.admin.users));
A.patch('/users/:id', can('users.manage'), id, v({ role: opt(r.oneOf(['LISTENER', 'CURATOR', 'ADMIN'])), isActive: opt(r.bool()) }), h(c.admin.updateUser));
A.get('/models', can('health.view'), h(c.admin.models));
A.patch('/models/:id/params/:code', can('models.tune'), v({ id: r.int(1, 65535), code: r.str(2, 40, /^[a-z_]+$/) }, 'params'),
  v({ value: r.num(-1000, 100000) }), h(c.admin.setParam));
A.post('/models/:id/activate', can('models.tune'), id, h(c.admin.activateModel));
A.get('/audit', can('audit.view'), v({ entityType: opt(r.str(1, 30, /^[a-z_]+$/), null), limit: opt(r.int(1, 200), 50) }, 'query'), h(c.admin.audit));
A.get('/reviews', can('pipeline.view'), v({ status: opt(r.oneOf(['PENDING', 'APPROVED', 'REJECTED', 'MERGED', 'IGNORED', 'REPROCESS', 'ALL']), 'PENDING'),
  limit: opt(r.int(1, 200), 50) }, 'query'), h(c.admin.reviews));
A.post('/reviews/:id/decision', can('review.decide'), id, v({
  action: r.oneOf(['APPROVE', 'MERGE', 'REJECT', 'IGNORE', 'REPROCESS']), note: opt(r.str(0, 300)),
  patch: opt(r.object({
    title: opt(r.str(1, 150)), artist: opt(r.str(1, 100)), duration_sec: opt(r.int(30, 1800)),
    isrc: opt(r.str(12, 12, /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/)), language: opt(r.str(2, 3, /^[a-z]+$/)), genre: opt(r.str(1, 40)),
    release_year: opt(r.int(1900, 2100)), explicit: opt(r.bool()), content_rating: opt(r.oneOf(['ALL', 'TEEN', 'MATURE'])),
  })),
}), h(c.admin.decide));
A.get('/health', can('health.view'), h(c.admin.health));
A.get('/performance', can('health.view'), h(c.admin.performance));
A.get('/sources', can('pipeline.view'), h(c.admin.sources));
A.patch('/sources/:code', can('pipeline.run'), v({ code: r.str(2, 30, /^[A-Z_]+$/) }, 'params'),
  v({ enabled: opt(r.bool()), priority: opt(r.int(1, 255)) }), h(c.admin.updateSource));
A.get('/jobs', can('pipeline.view'), v(limitQ, 'query'), h(c.admin.jobs));
A.get('/jobs/:id', can('pipeline.view'), id, h(c.admin.job));
A.get('/feeds', can('pipeline.view'), h(c.admin.feedFiles));
A.post('/pipeline/ingest', can('pipeline.run'), v({
  sourceCode: opt(r.str(2, 30, /^[A-Z_]+$/), 'MUSE_CATALOG_FEED'), file: opt(r.str(1, 80, /^[A-Za-z0-9._-]+\.json$/)), force: opt(r.bool(), false),
}), h(c.admin.ingest));
A.post('/pipeline/weekly', can('pipeline.run'), v({ force: opt(r.bool(), false) }), h(c.admin.weekly));
A.post('/pipeline/trends', can('pipeline.run'), h(c.admin.trends));
// providers and media
const PCODE = v({ code: r.oneOf(['MUSICBRAINZ', 'TMDB', 'YOUTUBE_DATA', 'EXTERNAL_PREVIEW', 'THEAUDIODB', 'LOCAL_MEDIA', 'AI']) }, 'params');
A.get('/providers', can('pipeline.view'), h(c.admin.providers));
A.post('/providers/:code/test', can('pipeline.run'), PCODE, h(c.admin.testProvider));
A.get('/films', can('catalog.write'), h(c.admin.films));
A.post('/films/:id/enrich', can('catalog.write'), id, v({ tmdbId: opt(r.str(1, 12, /^[0-9]+$/)) }), h(c.admin.enrichFilm));
A.post('/songs/:id/video-links', can('catalog.write'), id, h(c.admin.videoLinks));
A.get('/media', can('catalog.write'), h(c.admin.media));
A.post('/media/check', can('catalog.write'), h(c.admin.checkMedia));
A.post('/songs/:id/media', can('catalog.write'), id, v({
  fileName: r.str(1, 121, /^[A-Za-z0-9][A-Za-z0-9._-]*$/), rights: opt(r.oneOf(['PERMITTED', 'ATTRIBUTION_REQUIRED']), 'PERMITTED'),
  attribution: opt(r.str(0, 200), null),
}), h(c.admin.registerMedia));
// Artist onboarding and rights review is separate from catalogue curation.
A.get('/artist-applications', can('artist.review'), v({ status: opt(r.oneOf(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ALL']), 'PENDING'), limit: opt(r.int(1, 200), 100) }, 'query'), h(c.admin.artistApplications));
A.post('/artist-applications/:id/decision', can('artist.review'), id, v({ action: r.oneOf(['APPROVE', 'REJECT']), note: opt(r.str(0, 500)) }), h(c.admin.decideArtistApplication));
A.get('/artist-uploads', can('artist.review'), v({ status: opt(r.oneOf(['UPLOADING', 'QUARANTINED', 'PROCESSING', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'TAKEN_DOWN', 'PROCESSING_FAILED', 'ALL']), 'PENDING_REVIEW'), limit: opt(r.int(1, 200), 100) }, 'query'), h(c.admin.artistUploads));
A.post('/artist-uploads/:id/scan', can('artist.review'), uploadId, h(c.admin.scanArtistUpload));
A.post('/artist-uploads/:id/decision', can('artist.review'), uploadId, v({ action: r.oneOf(['APPROVE', 'REJECT']), note: opt(r.str(0, 500)) }), h(c.admin.decideArtistUpload));
A.post('/artist-uploads/:id/publish', can('artist.review'), uploadId, h(c.admin.publishArtistUpload));
A.get('/artist-rights-reports', can('artist.review'), v({ status: opt(r.oneOf(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'ALL']), 'OPEN'), limit: opt(r.int(1, 200), 100) }, 'query'), h(c.admin.artistRightsReports));
A.post('/artist-rights-reports/:id/decision', can('artist.review'), id, v({ status: r.oneOf(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']), note: opt(r.str(0, 500)) }), h(c.admin.resolveArtistRightsReport));

router.use('/admin', A);

module.exports = router;
