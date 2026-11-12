# LOOP DBMS core edition — release notes (12 November 2026)

This edition narrows the listener workflow around the academic DBMS demonstration.
The visible navigation is Home, Search, Library, Database, Settings, and the
role-gated Admin page. Older mood, world, private-session, film, and assistant routes
are not part of the primary navigation; legacy route paths redirect to the core pages.

## Listener experience

- Home uses a rotating Spotify catalogue spotlight, Spotify artwork, global track
  picks, and worldwide search shortcuts. The banner artwork is selected from live
  Spotify search results; it is not represented as a verified chart ranking.
- Search queries Spotify tracks and displays their title, artist, album, duration,
  and artwork. A track opens in Spotify's official embed within LOOP.
- The bottom mini-player opens the expanded Now Playing view from the artwork or
  title. The same Spotify iframe is used in both layouts to avoid creating duplicate
  playback sessions.
- Spotify's official embed owns play, pause, seek, and track controls. LOOP does not
  show inactive controls that pretend to control the external iframe.
- Tracks explicitly marked unavailable in the requested market are not added to the
  LOOP play queue.

## DBMS focus

- LOOP account login uses bcrypt password hashes and server-side session cookies.
- Spotify search requests write query text, normalized query and result count to
  `search_history`.
- Track selection writes the LOOP user, Spotify track ID, event type and timestamp
  to `spotify_embed_events`.
- Spotify tokens and Spotify audio are not stored in MySQL.
- The Database page displays live table/view/column/key/index/routine/trigger counts
  from MySQL `information_schema`, in addition to the generated schema snapshot.
- The visible demo login panel is controlled by `VITE_SHOW_DEMO_CREDENTIALS`.

## Classroom demo accounts

After generating the seed and applying every migration:

| Role | Username | Password |
|---|---|---|
| Listener | `meera` | `Listener@123` |
| Curator | `kavya` | `Curator@123` |
| Administrator | `admin` | `Admin@123` |

Disable the demo-credential display and change seeded passwords before any public
or internet-facing deployment.

## Spotify configuration

Paste the Spotify **Client ID** in Settings and connect the user with OAuth PKCE.
No Client Secret belongs in the browser. Use the exact callback URL shown by LOOP
Settings in the Spotify Developer Dashboard. Locally open `http://127.0.0.1:5173`;
for production use the deployed HTTPS callback.

LOOP uses Spotify metadata and the official embedded player. Full playback depends
on Spotify's embed experience, account, market and selected track. This is not an
unrestricted audio API or a direct audio URL. Spotify's Developer Policy places
limits on products that combine Spotify content with another music service or copy
Spotify's core experience, and commercial streaming use requires appropriate
permission. See the Spotify policy and embed documentation before distribution.

## Validation

- Deployment preflight: 39/39 checks passed.
- Static UI audit: 10/10 checks passed.
- Frontend JSX parser pass: 47/47 files parsed.
- Backend source syntax checks: passed.
- Focused Spotify adapter tests: 5/5 passed.
- Frontend helper smoke checks: 3 passed.
- Full npm build and full test suites were not run because the npm registry package
  tarball for `lucide-react` was not present in the local npm cache and dependency
  installation could not complete in this environment.
- Live Spotify playback and MySQL connectivity require the user's Developer app,
  Premium account, configured redirect URI, and local MySQL environment.
