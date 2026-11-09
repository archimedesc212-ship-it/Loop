// Source registry used by the ingestion pipeline: music_sources.code -> adapter.
// Adding a provider = an adapter (src/providers) + a row in music_sources
// (rights scope, priority, fallback). See docs/PROVIDERS.md.
const fileFeed = require('./fileFeedSource');
const { musicbrainz } = require('../providers');

const adapters = { [fileFeed.code]: fileFeed, [musicbrainz.code]: musicbrainz };
module.exports = { adapterFor: (code) => adapters[code] || null, adapters };
