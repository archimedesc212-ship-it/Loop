# LOOP Guest Mode and Optional Accounts

LOOP opens directly to the music application. Login is optional: visitors can keep listening as guests, and registered listeners can sign in when they want account-backed syncing.

## Guest experience

- In database-free browser mode (`VITE_DEMO_MODE=true`), the app uses its local catalogue adapter and stores supported personal state in this browser. Account creation and sign-in are intentionally unavailable because there is no account server or database behind that deployment.
- In account-enabled mode (`VITE_DEMO_MODE=false`), the API creates a guest session automatically when a visitor has no valid session. Guest sessions can browse and use the listener features without entering credentials.

## Enable optional accounts

Configure the backend API and MySQL database using the server-side variables documented in `.env.example` and `docs/DEPLOYMENT.md`. Then set the frontend build variable:

```env
VITE_DEMO_MODE=false
```

Deploy the API and frontend together so same-origin `/api` requests reach the configured backend. Do not put database passwords, session secrets, or other private server credentials in `VITE_*` variables. Only frontend-safe values belong there.

## Create an account from a guest session

When a guest chooses **Create account**, the API promotes that authenticated guest identity in place. The `user_id` is retained, so rows already owned by that guest (such as likes, playlists, ratings, preferences and listening history) remain attached to the new account. The server accepts this upgrade only for LOOP guest identities (`@guest.loop.invalid`); it rejects attempts to use this endpoint to modify an already registered account.

A visitor who chooses **Sign in** instead switches to the existing account. That does not merge a separate guest identity into the signed-in account. To keep the current guest profile's data, choose **Create account** from that guest session.

## Honest limitations

- Database-free mode does not create real accounts and does not sync between browsers or devices.
- Account-enabled mode requires a working backend, MySQL database, schema migrations and secure server configuration.
- This feature does not provide email verification or password-reset delivery; those need an email provider and a separate verified flow before being advertised as available.
