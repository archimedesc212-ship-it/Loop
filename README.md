# LOOP — DBMS Music Discovery Project

LOOP is a database-first music discovery application built for a DBMS academic project. The React website provides Home, Search, Library, Database Explorer and Settings. The Express backend owns application logic and connects to MySQL 8; the database stores LOOP identities, roles, catalogue relationships, playlists, search history, playback/embed activity, feedback and audit records.

Spotify supplies catalogue search metadata and its official embedded player. LOOP does **not** download or extract Spotify audio. A Spotify Client ID is configured by the user in **Settings → Spotify connection** and OAuth uses Authorization Code with PKCE. Full-track playback is controlled by Spotify and depends on the account, market and embed availability. See [Spotify setup and limitations](docs/DBMS_PROJECT_GUIDE.md#spotify-setup-in-loop-settings).

## Main features

- Home spotlight banners using Spotify album artwork and links back to Spotify.
- Worldwide track search by title, artist or album.
- Official Spotify embedded player docked in LOOP; expanded player opens with the bottom player bar.
- LOOP user accounts, role-based access, server-side sessions and bcrypt password hashes.
- MySQL-backed search history, Spotify embed-open event log, profiles, playlists and local catalogue data.
- Database Explorer with schema relationships and live MySQL counts from `information_schema`.
- Admin database health and audit tools.
- SQL schema with primary/foreign keys, constraints, indexes, views, functions, procedures and triggers.

## DBMS demo accounts

Shown on the login screen when `VITE_SHOW_DEMO_CREDENTIALS=true` and after the seed plus all migrations are applied.

| Role | Username | Password |
|---|---|---|
| Listener | `meera` | `Listener@123` |
| Curator | `kavya` | `Curator@123` |
| Administrator | `admin` | `Admin@123` |

These are classroom demonstration accounts only. Disable the display flag and rotate/remove the seeded passwords before a public deployment.

## Quick start

**Requirements:** Node.js 20.19+ (Node 22 recommended), MySQL 8.0.19+, npm.

1. Create a MySQL owner account (setup/migrations only) and an application account (used by the API). Follow the least-privilege instructions in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).
2. Copy `.env.example` to `.env`. Update the MySQL values and replace the session secret with a random value of at least 32 characters.
3. Install and initialise a new, empty development database:

   ```bash
   npm ci
   npm run db:seed:generate
   npm run db:setup -- --allow-destructive --no-intel
   npm run db:migrate
   npm run dev
   ```

   `db:setup -- --allow-destructive` drops and recreates the selected schema. Use it only on a new/empty development database. For an existing database, take a backup and use `npm run db:migrate` only.

4. Open `http://127.0.0.1:5173`. The Vite dev server proxies `/api` to Express on port 4000. Use `127.0.0.1` rather than `localhost` for local Spotify OAuth.
5. Sign in with a demo account. Open **Settings → Spotify connection**, paste the Spotify **Client ID**, save, connect your Spotify account, and search for a track. Add the exact Redirect URI shown there to your Spotify Developer Dashboard app.

## Spotify configuration

Spotify Client ID is entered in LOOP Settings in the browser. No Client Secret is required for the PKCE public-client flow; do not put secrets in `VITE_*` variables. Spotify tracks are searched through the backend and search queries/result counts are saved in MySQL. The official Spotify embed handles playback; LOOP does not own or extract the audio stream. Spotify policies restrict commercial streaming, mixing content from multiple services in one integrated streaming product, and products that replace Spotify's core experience without prior written permission. See [Spotify Developer Policy](https://developer.spotify.com/policy) and the [DBMS project guide](docs/DBMS_PROJECT_GUIDE.md).

## DBMS implementation

The database includes normalized entities and relationship tables, ACID transactions, integrity constraints, foreign keys, indexes, views, stored procedures, stored functions, triggers and audit logging. The Database Explorer shows a schema snapshot plus live counts from the running MySQL connection. The repository's design documentation describes 64 tables, 20 views, 11 procedures, 11 functions and 14 triggers (before pending/new migrations, live counts may vary).

## Project structure

- `database/` — baseline schema, functions, views, procedures, triggers, seed data, SQL demonstrations and versioned migrations.
- `backend/src/` — Express routes, controllers, services, MySQL connection, authentication and Spotify metadata integration.
- `frontend/src/` — React pages, components, player, Spotify PKCE login and DBMS Explorer.
- `docs/` — architecture, schema, testing, deployment and academic project guide.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run db:status` | Inspect migration status |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:verify` | Verify fresh install and upgrade paths |
| `npm run test:sql` | Run the SQL demonstration queries |
| `npm run demo:concurrency` | Run transaction/concurrency demonstrations |
| `npm run demo:explain` | Compare query plans and indexes |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the frontend |

For setup, ER diagrams, schema details and viva preparation, start with [docs/DBMS_PROJECT_GUIDE.md](docs/DBMS_PROJECT_GUIDE.md), [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md), [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) and [docs/VIVA.md](docs/VIVA.md).
