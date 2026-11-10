# LOOP V7 audit and multilingual catalogue fixes

## Fixed
- `user` is nullable during initial session hydration; every direct `user.incognito` read in frontend source was changed to optional access.
- Guest/demo session permissions are normalised to an array before permission checks.
- Database-free browser mode is the default unless `VITE_DEMO_MODE=false` is explicitly configured.
- Added 36 curated Telugu, Hindi and Tamil metadata entries. They link to official-provider search results and do not contain or redistribute audio.
- Added language discovery/detail responses and language-aware search.
- Added Telugu, Hindi and Tamil shelves to the home screen.
- Added a build fallback catalogue when the external CSV source cannot be reached, so a transient upstream outage does not stop Vercel from producing a static site.

## Validation performed
- JavaScript syntax checks: passed for frontend `.js` files.
- UI release audit: 9/9 passed.
- Offline catalogue preparation fallback: passed.
- ZIP integrity: verified.

## Not verified in this environment
- Full Vite production build: could not run because the local `vite` executable returned `Permission denied`; this is an environment/dependency installation issue.
- Browser end-to-end testing and actual YouTube playback were not run.
- The multilingual additions are a curated starter set, not a complete or licensed music catalogue. Playback opens YouTube search; users select official uploads/embeds. No music audio is bundled.
- Browser-local likes, ratings and preferences do not sync between devices. Account/admin/server features require a separately configured backend and are not part of the database-free Vercel mode.

## Vercel deployment
Use repository root, `npm ci`, `npm run build`, output `frontend/dist`, and set `VITE_DEMO_MODE=true` (or leave it unset; true is the default). Do not set `VITE_DEMO_MODE=false` unless an API and database are separately deployed.
