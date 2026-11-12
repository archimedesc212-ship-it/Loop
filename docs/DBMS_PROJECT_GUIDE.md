# LOOP — DBMS academic project guide

LOOP is a React + Express + MySQL music catalogue and listening-activity application. The **database is the system of record** for LOOP accounts, roles, profiles, local catalogue data, playlists, searches, playback events, user feedback and audit history. Spotify is an external catalogue/official-player integration; Spotify audio and its catalogue content are not downloaded or stored in LOOP's MySQL database.

## What to demonstrate

1. **Authentication and roles** — sign in as Listener, Curator or Administrator. Passwords are stored as bcrypt hashes. The API uses server-side sessions, not a password or Spotify token in the database.
2. **Relational catalogue** — inspect users, profiles, artists, albums, songs, genres, languages and the relationship tables in the Database Explorer.
3. **Many-to-many data** — `playlist_songs` connects playlists and songs; `user_languages`, `song_genres` and `role_permissions` are further examples.
4. **Search logging** — a successful Spotify catalogue search stores the search text, normalized query and returned result count in `search_history` for the signed-in LOOP user.
5. **Spotify embed events** — when a Spotify track is opened in LOOP's official embedded player, `spotify_embed_events` stores the LOOP user ID, Spotify track ID, event type and timestamp. It does not store audio or copied Spotify metadata.
6. **DBMS objects** — review primary/foreign keys, unique/check constraints, indexes, views, functions, procedures and triggers. The Database Explorer shows both a schema snapshot and a live MySQL summary from `information_schema`.
7. **Transactions and concurrency** — use the documented SQL examples and `npm run demo:concurrency` on a disposable development database.

## Core website pages

- **Home** — Spotify catalogue spotlight banner, album artwork, global discovery shelves and quick links to core pages.
- **Search** — search Spotify tracks by title, artist or album. Results show artwork and metadata, then open the selected track in Spotify's official embedded player within LOOP.
- **Library** — LOOP-owned playlists and local catalogue relationships. Spotify tracks can be discovered and opened from Search; only LOOP-owned catalogue IDs can be saved to LOOP's local song relationships where applicable.
- **Database** — schema explorer, keys/relationships and live MySQL object counts.
- **Settings** — Spotify Client ID, account connection, profile preferences and account security.
- **Admin** — role-protected database health, users, catalogue and audit/operations tools.

## Demo accounts

After a **fresh seed and all migrations** are applied, use one of these accounts on `/login`:

| Role | Username | Password |
|---|---|---|
| Listener | `meera` | `Listener@123` |
| Curator | `kavya` | `Curator@123` |
| Administrator | `admin` | `Admin@123` |

The `aarav` seed account is renamed to `varsha` by migration `0006`, so `meera` is the stable listener demo. The login page displays these seeded demo credentials only when `VITE_SHOW_DEMO_CREDENTIALS=true`. They are for classroom/local use. Turn the flag off and rotate/remove these accounts before any public deployment.

## Local setup

**Prerequisites:** Node.js 20.19+ (Node 22 recommended), MySQL 8.0.19+, and npm.

1. Create a MySQL owner account and a separate app account. The owner account is used only for database setup/migrations; the API connects as the least-privilege app account. See [ENVIRONMENT.md](ENVIRONMENT.md) and [RENDER_MYSQL_SETUP.md](RENDER_MYSQL_SETUP.md) for grant details.
2. Copy `.env.example` to `.env` in the repository root and replace all database passwords and `SESSION_SECRET` with local values. The example enables DB mode and the classroom credentials.
3. Install packages and set up a new empty development database:

   ```bash
   npm ci
   npm run db:seed:generate
   npm run db:setup -- --allow-destructive --no-intel
   npm run db:migrate
   npm run dev
   ```

   **Warning:** `db:setup -- --allow-destructive` drops and recreates the selected schema. Use it only for a new/empty academic database. For an existing database, back it up and run `npm run db:migrate` only.

4. Open `http://127.0.0.1:5173` for Vite development. Use `127.0.0.1`, not `localhost`, for Spotify local OAuth because Spotify no longer accepts `localhost` redirect URIs.

## Spotify setup in LOOP Settings

1. Create a Spotify developer app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. In LOOP, sign into a seeded account, open **Settings → Spotify connection**, and paste the **Client ID** (Spotify calls this the Client ID, not an API key). Save it and choose **Connect Spotify**.
3. Add the exact Redirect URI shown in Settings to the Spotify app. On local development open LOOP at `http://127.0.0.1:5173`; on deployment use the site's HTTPS origin, e.g. `https://your-domain.example/spotify/callback`.
4. Authorise Spotify using Authorization Code with PKCE. LOOP does not need the Client Secret for this public browser flow. The Spotify token remains in browser session storage; it is sent to the LOOP API only in the search request header and is not stored in MySQL.
5. Search a song. The selected track opens in Spotify's official embedded player on the LOOP page. Use the controls inside that official player. A logged-in Spotify Premium listener may receive full-track playback where Spotify makes it available; Spotify controls the playback experience and availability.

Spotify's official Embed can be used inside a website; the project uses a compact 152 px player dock and expands the player when Now Playing is opened. The iframe remains Spotify-controlled. LOOP's custom player bar opens the Now Playing view; it does not pretend to control playback inside Spotify's iframe. See [Creating an Embed](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed).

**Important platform limitations:** A Spotify Client ID is not an audio-download key. LOOP does not extract, download, cache, re-host, proxy or alter Spotify recordings. The official embed controls playback. Full playback depends on the user's Spotify account, market, track and Spotify's own embed experience. Spotify requires Premium for Web Playback SDK streaming and places restrictions on apps that replicate Spotify's core service, combine Spotify content with another music service, or use streaming SDKs commercially without written approval. Read the [Spotify Developer Policy](https://developer.spotify.com/policy) before any distribution beyond an academic prototype. LOOP's Spotify integration is kept separate from YouTube/Openverse/Jamendo playback.

## Database design facts

The repository's design documentation reports 64 tables, 20 views, 11 stored procedures, 11 stored functions, 14 triggers, 71 CHECK constraints, 124 foreign keys and 222 indexes. Counts shown by the live MySQL panel reflect the schema actually connected to the running API; they can differ before every migration is applied. See [DATABASE_DESIGN.md](DATABASE_DESIGN.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [VIVA.md](VIVA.md) and [`database/08_queries.sql`](../database/08_queries.sql).

## Useful commands

| Command | Use |
|---|---|
| `npm run db:status` | Show applied and pending schema migrations |
| `npm run db:migrate` | Apply pending migrations safely |
| `npm run db:verify` | Verify fresh-install and upgrade paths in throw-away schemas |
| `npm run db:workbench` | Generate Workbench SQL and schema/data extracts |
| `npm run demo:concurrency` | Demonstrate concurrent transactions and lost-update prevention |
| `npm run demo:explain` | Compare query plans and index use |
| `npm run test:sql` | Run documented SQL query blocks against MySQL |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the React frontend |

## Viva topics

Be ready to explain: 1NF–BCNF normalization, surrogate/composite keys, foreign-key delete rules, indexes and EXPLAIN, transactions and ACID, isolation levels, deadlocks and retries, stored procedures vs functions, triggers for integrity/audit, views for reporting, least-privilege DB accounts, bcrypt password hashing, server-side sessions, and why Spotify audio is not stored as a BLOB in LOOP.
