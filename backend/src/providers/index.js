// Provider registry: what each integration is for, what it needs, and its live
// configuration state (never the secret values themselves).
const musicbrainz = require('./musicbrainz');
const tmdb = require('./tmdb');
const youtube = require('./youtube');
const externalPreview = require('./externalPreview');
const theAudioDb = require('./theAudioDb');
const localMedia = require('./localMedia');
const ai = require('./ai');

const PROVIDERS = [
  { adapter: musicbrainz, name: 'MusicBrainz', purpose: 'Music metadata (recordings, ISRC, artists, releases) plus Cover Art Archive release artwork', kind: 'METADATA',
    env: ['MUSICBRAINZ_ENABLED', 'MUSICBRAINZ_USER_AGENT'], credential: 'None (descriptive User-Agent with contact details)',
    signup: 'https://musicbrainz.org/doc/MusicBrainz_API', terms: 'Free for non-commercial use (commercial plans exist); about 1 request/second per IP; identify your application.' },
  { adapter: tmdb, name: 'TMDB', purpose: 'Film metadata for soundtrack albums', kind: 'METADATA',
    env: ['TMDB_ENABLED', 'TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY'], credential: 'API Read Access Token (v4) or API key (v3)',
    signup: 'https://www.themoviedb.org/settings/api', terms: `Free for non-commercial use with attribution (commercial use needs a TMDB licence). Notice: "${tmdb.ATTRIBUTION}" plus an approved TMDB logo in About/Credits. Images are not stored by MUSE.` },
  { adapter: youtube, name: 'YouTube Data API v3', purpose: 'Search embeddable videos and play through the official YouTube iframe player', kind: 'VIDEO_METADATA',
    env: ['YOUTUBE_ENABLED', 'YOUTUBE_API_KEY'], credential: 'Google Cloud API key with YouTube Data API v3 enabled',
    signup: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', terms: 'YouTube API Services Terms; default search quota is limited; playback uses the official embedded player only. Never download, extract, proxy or re-host audio.' },
  { adapter: externalPreview, name: 'External preview provider', purpose: 'Licensed short audio previews by ISRC (vendor-neutral contract)', kind: 'PLAYBACK',
    env: ['EXTERNAL_PREVIEW_ENABLED', 'EXTERNAL_PREVIEW_BASE_URL', 'EXTERNAL_PREVIEW_API_KEY', 'EXTERNAL_PREVIEW_MEDIA_ORIGIN'], credential: 'Depends on the licensed provider you contract',
    signup: null, terms: 'Only use a provider whose licence covers streaming previews to your users.' },
  { adapter: theAudioDb, name: 'TheAudioDB', purpose: 'Artist biographies, banners, fan art and album artwork (metadata only)', kind: 'METADATA',
    env: ['THEAUDIODB_ENABLED', 'THEAUDIODB_API_KEY'], credential: 'Shared free/test key 123 (premium key optional)',
    signup: 'https://www.theaudiodb.com/free_music_api', terms: 'Free API is rate-limited to 30 requests/minute; credit TheAudioDB and follow its artwork terms. Never used as an audio source.' },
  { adapter: localMedia, name: 'Local media', purpose: 'Audio files you own or are licensed to use, streamed from LOCAL_MEDIA_DIR', kind: 'PLAYBACK',
    env: ['LOCAL_MEDIA_ENABLED', 'LOCAL_MEDIA_DIR'], credential: 'None', signup: null, terms: 'You are responsible for the rights to every file you add.' },
  { adapter: ai, name: 'AI (Anthropic Messages API)', purpose: 'Optional fallback for free-text mood input the local parser cannot read', kind: 'AI',
    env: ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL'], credential: 'Anthropic API key', signup: 'https://console.anthropic.com/',
    terms: 'Paid per token; only the typed sentence is sent; output is restricted to known moods.' },
];

function status() {
  return PROVIDERS.map((p) => ({ code: p.adapter.code, name: p.name, purpose: p.purpose, kind: p.kind, env: p.env, credential: p.credential,
    signup: p.signup, terms: p.terms, ...p.adapter.check() }));
}

module.exports = { status, musicbrainz, tmdb, youtube, externalPreview, theAudioDb, localMedia, ai };
