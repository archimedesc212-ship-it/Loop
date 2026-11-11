# LOOP — Curated music product roadmap

**Active scope: 102 features across 12 music-focused categories.** The previous 120-item brainstorm was reviewed against the actual LOOP product scope. Eighteen low-fit, redundant, technically unsupported or rights-dependent proposals were removed from the active roadmap.

## Product direction

LOOP is a music discovery and listening app. Its core experience is Home, Discover, Assistant, Search, Player and Library, with artist submission and essential admin review. The roadmap below strengthens that product; it does not turn LOOP into a general social network or a movie/anime streaming service.

## How to read the status

- **In source** — corresponding implementation is present in the project source; it is not a guarantee that every production path has passed end-to-end testing.
- **Partial** — a foundation exists, but the complete user flow or edge cases still need work.
- **Planned** — retained as a good fit for LOOP, but not represented as completed.
- **Provider-dependent** — appropriate for LOOP, but needs a reliable external chart/catalogue source before it can be delivered truthfully.

**Important:** This is a curated scope, not a claim that all 102 features are implemented. Existing code and the basic product scope provide foundations for account access, mood discovery, the music assistant, multi-provider search, YouTube/Apple embedded playback, player/queue, playlists, listening history, MusicBrainz/Cover Art Archive metadata and artist/admin workflows. Full production build, live provider tests and database-backed end-to-end tests are still required before calling the release complete.

## Curated feature list

### Homepage, banners and music highlights

- **Rotating editorial hero banners** — `PLANNED`. Cycle through a small set of real, available music features; never use placeholder tracks.
- **Live featured song banner from YouTube** — `IN SOURCE`. The current Home page already fetches YouTube music-video metadata for a featured banner; verify live provider behaviour after deployment.
- **Artist spotlight banner** — `PLANNED`. Feature an artist with MusicBrainz or trusted catalogue metadata.
- **New-release spotlight** — `PROVIDER-DEPENDENT`. Requires a reliable release feed and region-aware availability.
- **Mood-based hero artwork** — `PLANNED`. Use available track or release artwork for mood discovery.
- **Subtle animated visual backgrounds** — `PLANNED`. Keep motion restrained and respect reduced-motion preferences.
- **Recently played home shortcut** — `IN SOURCE`. Recently played content already appears on Home; refine its placement and empty state.
- **Featured playlist carousel** — `PLANNED`. Show real LOOP playlists and editorial collections.
- **Personalised banner rotation** — `PLANNED`. Use a listener’s genres, saved artists and recent activity with privacy controls.

### Music search and discovery

- **Unified search across LOOP, Apple Music, YouTube and MusicBrainz** — `IN SOURCE`. The current Search page already calls the LOOP catalogue and external music metadata/search adapters; verify provider configuration.
- **Search suggestions while typing** — `PLANNED`. Suggest real tracks, artists, albums and genres.
- **Search history** — `PLANNED`. Store per-account and clearable history; respect incognito mode.
- **Trending search terms** — `PLANNED`. Use aggregated, privacy-safe search counts rather than fabricated trends.
- **Search by genre and subgenre** — `PARTIAL`. Genre discovery shortcuts exist; richer search filters remain to be completed.
- **Search by language** — `PLANNED`. Only display language tags when supplied by a reliable catalogue source.
- **Search by country or region** — `PARTIAL`. Apple storefront searches already use regional catalogues; add explicit region filtering.
- **Search by decade** — `PLANNED`. Use verified release-year metadata.
- **Advanced filters for artist, album, genre and duration** — `PLANNED`. Filters should work across the data source that actually supplies each field.

### Personalised music recommendations

- **Daily personalised mix** — `IN SOURCE`. A daily recommendation endpoint and Home shelf already exist; verify with a real signed-in account.
- **Weekly discovery mix** — `PLANNED`. A fresh weekly mix based on opted-in listening signals.
- **Similar-song recommendations** — `PLANNED`. Use available audio features and metadata; explain when a match is approximate.
- **Similar-artist recommendations** — `PLANNED`. Use verified artist relationships or catalogue similarity.
- **Mood-aware recommendations** — `IN SOURCE`. Mood selection and free-text mood recommendations already exist.
- **Activity-based suggestions** — `PLANNED`. Examples include focus, workouts and relaxing; do not infer sensitive traits.
- **Time-aware suggestions** — `PLANNED`. Use local time only as a lightweight optional signal.
- **Familiarity versus discovery control** — `PLANNED`. Let listeners choose between familiar tracks and new discoveries.
- **Explain why a track was recommended** — `PARTIAL`. Recommendation reason fields exist in the UI; make reasons consistent and evidence-based.
- **Learn from likes, saves and skips** — `PLANNED`. Use explicit feedback with privacy controls; avoid over-personalising from sparse signals.

### Player and listening experience

- **Official YouTube embedded playback** — `IN SOURCE`. The player recognises YouTube embed playback; embedding and regional restrictions still apply.
- **Persistent mini-player** — `IN SOURCE`. A persistent player bar is already present in the application layout.
- **Expanded now-playing screen** — `PLANNED`. Provide album art, track information, queue and supported playback controls.
- **Play queue management** — `IN SOURCE`. The player already has a queue panel and track navigation.
- **Play next and add to queue** — `PARTIAL`. Queue foundations exist; make both actions explicit and test queue ordering.
- **Sleep timer** — `IN SOURCE`. Sleep timer controls and fade handling already exist for supported local playback.
- **Keyboard media shortcuts** — `PLANNED`. Shortcuts must avoid hijacking typing in forms and text boxes.
- **Playback error and unavailable-track recovery** — `PLANNED`. Show clear reasons and safe alternatives; never fake audio or extract streams.

### Playlists and personal library

- **Create, edit and delete playlists** — `IN SOURCE`. Basic playlist management already exists.
- **Public and private playlist settings** — `PLANNED`. Make visibility explicit and enforce permissions server-side.
- **Playlist covers from available artwork** — `PLANNED`. Use artwork the provider allows LOOP to display; retain attribution where required.
- **Playlist sorting and filtering** — `PLANNED`. Sort by title, artist, date added and duration when data is available.
- **Duplicate-track detection** — `PARTIAL`. Duplicate/playlist-health logic exists in the source; verify that listener-facing cleanup is safe.
- **Playlist import and export** — `PLANNED`. Support transparent metadata-only import/export; do not copy protected audio.
- **Smart playlists based on listener rules** — `PLANNED`. Examples: liked tracks, recently added, genre or mood.
- **Shareable playlist links** — `PLANNED`. Respect public/private settings and account ownership.

### Artists, albums and releases

- **Artist profile pages** — `PLANNED`. Show available biography, artwork, genres and verified links.
- **Album and EP pages** — `PLANNED`. Display release metadata and tracklists where available.
- **Release-date timelines** — `PLANNED`. Do not infer missing dates.
- **Artist discography** — `PLANNED`. Use MusicBrainz or another trusted release catalogue.
- **Related artists** — `PLANNED`. Show source-backed relationships or clearly label similarity recommendations.
- **Album tracklists** — `PLANNED`. Use release metadata and identify incomplete tracklists.
- **Cover Art Archive artwork lookup** — `IN SOURCE`. Cover Art Archive integration is present; a MusicBrainz release ID and available image are required.
- **MusicBrainz release and recording metadata** — `IN SOURCE`. MusicBrainz provider integration is present; coverage varies by recording.
- **Artist country and genre tags** — `PLANNED`. Display only sourced metadata and allow unknown values.
- **Official artist links** — `PLANNED`. Use verified artist/provider links rather than guessed URLs.

### Charts and music trends

- **Global top tracks** — `PROVIDER-DEPENDENT`. Requires a defined chart source and attribution.
- **Country-specific charts** — `PROVIDER-DEPENDENT`. Requires a chart source with country-level data.
- **Genre charts** — `PROVIDER-DEPENDENT`. Use sourced chart data or clearly labelled LOOP listening aggregates.
- **Language charts** — `PROVIDER-DEPENDENT`. Requires reliable language tags and a transparent chart methodology.
- **Rising artists** — `PROVIDER-DEPENDENT`. Define the growth metric and data window; do not invent popularity.
- **Trending music videos** — `IN SOURCE`. YouTube search can supply current video results; label them as YouTube results, not universal music charts.
- **New releases by region** — `PROVIDER-DEPENDENT`. Requires reliable release dates and regional availability data.
- **Decade and era collections** — `PLANNED`. Use verified release years; present as curated collections rather than live rankings.

### Artist follows, sharing and community

- **Follow artists** — `PLANNED`. Useful for saving artist interests and optionally receiving new-release alerts.
- **Share tracks and playlists** — `PLANNED`. Share metadata and permitted provider links, not copied audio.
- **Community-curated playlists** — `PLANNED`. Add reporting and moderation before public publishing.
- **Report and moderation tools** — `IN SOURCE`. Artist and catalogue review workflows already form a moderation foundation.

### Listener profiles and preferences

- **Custom profile avatar** — `PLANNED`. Allow a safe upload or selected preset with moderation and size limits.
- **Display name and short bio** — `PARTIAL`. Basic account identity exists; verify editing and privacy controls.
- **Favourite genres** — `PARTIAL`. Use onboarding/preferences already available and make them editable.
- **Favourite artists** — `PLANNED`. Use explicit follows/saves rather than inferred sensitive interests.
- **Preferred music languages** — `PLANNED`. An optional discovery preference.
- **Country and storefront preference** — `PARTIAL`. Regional storefront support exists; expose a clear user preference.
- **Listening privacy controls** — `IN SOURCE`. Privacy settings are part of the existing account/product foundation.
- **Incognito listening mode** — `IN SOURCE`. Incognito/private listening support exists in the current application.
- **Profile theme selection** — `PLANNED`. Keep a small accessible set of themes and preserve contrast.

### Track details and credits

- **Song credits** — `PLANNED`. Show credits only when a reliable source supplies them.
- **Songwriter and producer details** — `PLANNED`. Use sourced recording/release credits.
- **ISRC display** — `PLANNED`. Show the identifier when MusicBrainz or another source provides it.
- **Release, label and catalogue information** — `PLANNED`. Display source-backed metadata.
- **Explicit-content labels** — `PLANNED`. Only show labels supplied by a trusted provider.
- **Track duration and version details** — `PARTIAL`. Duration metadata exists for some records; version matching needs careful validation.
- **MusicBrainz recording and release identifiers** — `IN SOURCE`. The MusicBrainz provider uses these identifiers for metadata and artwork lookup.
- **Music source attribution** — `PLANNED`. Make provider/source attribution visible wherever required.

### Listening history and notifications

- **Recently played history** — `IN SOURCE`. A recent-history shelf and API integration already exist.
- **Optional listening streaks** — `PLANNED`. Keep opt-in and avoid guilt-based engagement mechanics.
- **New releases from followed artists** — `PLANNED`. Depends on artist follows and a reliable release feed.
- **Playlist update notifications** — `PLANNED`. Notify only users who opt in or follow the playlist.
- **Personal listening recap** — `PLANNED`. Summarise actual recorded listening, with clear privacy controls.
- **Monthly listening report** — `PLANNED`. Use only accurate, retained listening data.
- **Search and filter listening history** — `PLANNED`. Respect incognito mode and account retention settings.
- **Clear or export listening history** — `PLANNED`. Provide user-controlled deletion and export.
- **Notification preferences** — `PLANNED`. Allow users to turn each notification type off.

### Admin, reliability and catalogue quality

- **Admin overview dashboard** — `IN SOURCE`. A basic admin console is part of the current project.
- **Catalogue quality monitoring** — `PLANNED`. Track missing and conflicting metadata.
- **Provider health monitoring** — `PLANNED`. Report provider failures without exposing secrets.
- **YouTube API quota monitoring** — `PLANNED`. Use server-side usage counts and Google quota information where available.
- **Artwork coverage reports** — `PLANNED`. Measure how many releases have available artwork.
- **Duplicate metadata detection** — `PLANNED`. Flag possible duplicates for review rather than auto-merging uncertain matches.
- **Broken external-link checks** — `PLANNED`. Check links conservatively and respect provider policies.
- **User and artist moderation queues** — `IN SOURCE`. The current project has artist applications and catalogue review workflows.
- **Recommendation quality metrics** — `PLANNED`. Use aggregate, privacy-safe signals and transparent evaluation.
- **Audit logs and admin role controls** — `PARTIAL`. Role-based admin areas exist; verify every sensitive action and log coverage.

## Items removed from the active scope

These ideas were intentionally removed from the active LOOP roadmap. They are not part of the current delivery commitment:

- **Seasonal music campaigns** (original proposal 007) — Marketing campaigns are not a core listening/discovery capability.
- **Search by lyrics** (original proposal 015) — Requires licensed/indexed lyric content; excluded from the current product scope.
- **Crossfade** (original proposal 036) — Not reliable across third-party embedded players such as YouTube/Apple embeds.
- **Playback speed** (original proposal 037) — Third-party embedded players do not give LOOP dependable speed control.
- **Collaborative playlists** (original proposal 042) — Adds sharing permissions, concurrency and moderation complexity; defer beyond core library.
- **Playlist folders** (original proposal 045) — Adds library complexity before the core playlist experience needs it.
- **Chart movement indicators** (original proposal 069) — Requires historical snapshots and a dependable chart provider; lower value than accurate charts.
- **Chart history snapshots** (original proposal 070) — Requires a persistent chart-data feed and retention policy.
- **Follow other listeners** (original proposal 071) — Turns LOOP toward a general social network rather than music discovery.
- **Friend activity feed** (original proposal 073) — Social feed is not required for the core music experience and creates privacy overhead.
- **Collaborative listening rooms** (original proposal 075) — Real-time presence/synchronisation is costly and not core to LOOP.
- **Playlist comments** (original proposal 076) — Moderation overhead outweighs value for the initial music-discovery product.
- **Track reactions** (original proposal 077) — Redundant with likes/saves and expands moderation needs.
- **Taste-match comparison with friends** (original proposal 079) — Requires social graph and profile exposure; not essential to music discovery.
- **Personalised home layout** (original proposal 090) — Adds layout complexity; personalising recommendations and banners is more useful.
- **Timed lyrics** (original proposal 091) — Requires a suitable licensed lyrics provider and usage rights.
- **Plain lyrics** (original proposal 092) — Requires a suitable licensed lyrics provider and usage rights.
- **Recommendation refresh notifications** (original proposal 105) — Low-value notification; daily/weekly mixes can be shown in the app without extra push.

## Release acceptance rules

1. Only mark a feature **complete** after its UI, API/data behaviour, loading/empty/error states, permissions, accessibility and relevant tests pass.
2. Never claim a chart is global or trending without naming and validating its data source and methodology.
3. Never claim a recording is playable when LOOP has only metadata. Use authorised previews or official embedded players and respect region/embedding limits.
4. Lyrics, artwork, metadata and external links must follow the relevant provider terms and attribution requirements.
5. Keep API keys server-side. Do not put secrets in `VITE_` variables, browser bundles or source control.
6. Preserve incognito and listening-privacy behaviour across recommendations, notifications, analytics and history.
7. Keep the normal listener navigation focused: Home, Discover, Assistant, Search, Library and account settings. Admin/artist tools remain role-gated.

## Provider and deployment dependencies

- `YOUTUBE_API_KEY` must be configured in the server environment that runs the YouTube search endpoint; a Vercel frontend variable is not automatically available to a separately hosted backend.
- YouTube playback uses the official embedded player. LOOP cannot extract or proxy YouTube audio, and some videos cannot be embedded or played in every region.
- MusicBrainz needs a descriptive `MUSICBRAINZ_USER_AGENT`; release artwork needs a MusicBrainz release or release-group MBID and may be absent.
- Country/genre/language charts and regional release shelves need a documented, permitted data source. Do not substitute random YouTube search results as chart rankings.
- Lyrics features were deliberately removed until LOOP has an appropriate licensed lyrics provider.
