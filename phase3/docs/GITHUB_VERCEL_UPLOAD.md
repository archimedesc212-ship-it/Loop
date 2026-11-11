# Upload LOOP to GitHub and deploy with Vercel

This guide deploys the browser-only guest profile first. It does not require a MySQL database. Account syncing is a separate, later configuration step.

## 1. Push the source to GitHub

Extract the ZIP, open a terminal in the `LOOP` project root (the directory containing `package.json` and `vercel.json`), then run:

```bash
git init --initial-branch=main
git add -A
git status --short
git commit -m "Prepare LOOP music app for Vercel"
```

Create an empty GitHub repository (do not add a second README or license during creation), then connect and push:

```bash
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

Check `git status --short` before pushing. `.env`, credentials, `node_modules` and generated build output are ignored by `.gitignore`; keep real secrets out of the repository. Commit `.env.example`, never a filled `.env`.

## 2. Import the repository into Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import the GitHub repository you just pushed.
3. Keep **Root Directory** at the repository root, where `vercel.json` is located.
4. Use the checked-in build contract:
   - Install Command: `npm ci`
   - Build Command: `npm run build`
   - Output Directory: `frontend/dist`
   - Node runtime: 22.x
5. Leave `VITE_DEMO_MODE` unset for the browser-only guest profile. Do not add database credentials for this profile.
6. Deploy a Preview first. Test Home, Discover, Search, Library, playlist creation and the provider link fallback, then promote the Preview to Production.

## 3. Optional music-provider lookup

To resolve tracks to official YouTube video embeds from the browser-only profile, set `VITE_YOUTUBE_API_KEY` in Vercel. This is a public browser key, not a secret: restrict it to YouTube Data API v3 and the exact HTTP referrers for your deployment domains. Redeploy after adding it. Without the key, LOOP keeps the external YouTube search-link fallback. Neither option guarantees that every video is available or that it is the full recording.

## 4. Music search and playback providers

- **Openverse audio** works without a key. It is queried anonymously by the browser, with per-track creator/source/licence details. Respect anonymous rate limits and independently verify licences. Full-length playback depends on the remote source URL being a complete, playable recording.
- **YouTube** uses the YouTube Data API for discovery and the official visible iframe for playback. For the full-stack deployment, set `YOUTUBE_ENABLED=true` and `YOUTUBE_API_KEY` as backend environment variables. For the optional browser fallback, `VITE_YOUTUBE_API_KEY` is public and must be restricted to YouTube Data API v3 plus your deployed site's HTTP referrers. `VITE_ENABLE_YOUTUBE_EMBED_PLAYBACK` defaults to `true`; set it to `false` to turn off visible YouTube embeds. LOOP must not extract audio or hide/background the YouTube player.
- **Spotify** is a hand-off only: the Search page opens Spotify's official search experience. This release does not consume a Spotify API key or stream Spotify content inside LOOP. See [the provider and licensing boundaries](PROVIDERS.md).
- **Jamendo** remains optional; enable only with the Jamendo Client ID and after checking per-track licence terms.

## 5. Enable accounts and cross-device syncing later

Only when you have provisioned compatible MySQL 8.0.19+, applied the project migrations, created the least-privilege runtime user and configured every server-side environment variable in [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md):

- Set `VITE_DEMO_MODE=false` as a Vercel build environment variable.
- Configure `SESSION_SECRET`, database connection details, secure cookies, proxy trust and provider credentials where required.
- Apply migrations from a controlled machine after a verified backup; never run the destructive reset command against production.
- Confirm `https://YOUR-DEPLOYMENT/api/ready` returns HTTP 200 before promoting the account-enabled deployment.

Vercel serverless storage is not durable. Artist audio upload remains disabled until private object storage, signed access and a durable scanning worker are implemented and configured.

## 6. Run local release checks before production

On a machine with npm registry access:

```bash
npm ci
npm run deploy:check
npm run lint
npm test
npm run test:web
npm run build
```

The full backend/SQL suite also needs an isolated MySQL 8.0.19+ test database; browser end-to-end checks need Playwright browsers. A successful static guest deployment is not proof that the full account/database/media profile is production-certified.

## Optional Jamendo non-commercial streaming

After creating your Jamendo developer application, add these backend environment variables in Vercel Project → Settings → Environment Variables (Production and Preview as needed):

```dotenv
JAMENDO_ENABLED=true
JAMENDO_CLIENT_ID=your_jamendo_client_id
```

Do not use a `VITE_` prefix. Redeploy after saving the variables. Then sign in to LOOP, search for a track, and test the **Jamendo independent music** section. The Jamendo API terms restrict free API use to non-commercial use; do not enable ads, subscriptions, affiliate monetization or paid access unless Jamendo has separately licensed the application. Respect each track's Creative Commons licence and attribution. The integration does not cache, download, proxy, or re-host tracks.
