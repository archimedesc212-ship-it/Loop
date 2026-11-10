# Basic UI simplification and Mana icon integration

Date: 10 November 2026

## Product scope chosen

The standard LOOP listener experience is now deliberately limited to:

- Home
- Discover
- Search
- Library
- Settings (account area)

Role-specific areas remain available:

- Artist applications and Artist Studio for creator accounts
- Admin overview, catalogue, review queue, users and artist review for permitted staff

The ER explorer, listening profile, Mood Diary and LOOP World are no longer in the default navigation. Their older routes redirect to Home. Experimental recommendation panels are not shown in Discover. Existing server/database modules and academic DBMS documentation have been retained rather than deleted, so the smaller product UI does not damage the coursework baseline.

## UI changes

### Home

- Reduced to a greeting, a text mood request, a small set of mood tiles, a daily mix, popular tracks and shortcuts to the listener's library.
- Removed the World feature panel, dataset genre dashboard and additional recommendation shelves from the first screen.

### Discover

- Replaced the multi-panel mood lab with mood selection, short free-text request, optional activity context and one recommendation result.
- Removed Mood Dial, Mood Journey, custom mood percentages, and extra diagnostic presentation from the normal listener page.

### Library

- Reduced tabs to Playlists, Liked Songs and Recently Played.
- Kept playlist create/delete, play, add/remove song and like workflows.
- Removed playlist health scoring, duplicate-cleanup tools, mix rebuilding and advanced reorder controls from the normal playlist page.

### Artist Studio

- Reduced the upload form to track title, genre, language, release year, explicit flag, audio file and rights declarations.
- Kept the security-critical quarantine, file validation, scan, media probe and moderator-review requirements. License evidence is still requested when a licensed rights option is selected.

### Admin

- Reduced the standard console navigation to Overview, Catalogue, Review Queue, Users and Artists.
- Kept permission-based visibility and API-side authorization.

## Mana Universal Icon Kit

- Added `frontend/src/components/mana/Icon.jsx`, adapted from the supplied kit's `src/Icon.tsx` to JavaScript JSX.
- Added the supplied provider metadata registry as `frontend/src/components/mana/icon-registry.js` and corrected the Microsoft provider identifier typo.
- Replaced the previous hand-authored interface icon set with compatibility components in `frontend/src/components/Icons.jsx` backed by `lucide-react` and the Mana `AppIcon` wrapper.
- Added `lucide-react@^0.468.0` to `frontend/package.json` and the root workspace lockfile.
- Did not install `@lobehub/icons`: provider marks are not part of the basic music listener UI, and the kit instructions advise wiring provider marks only when a real provider-logo surface is needed.

## Checks run

- TypeScript parser: 44 JSX/TSX files parsed without syntax errors.
- Backend syntax: `node --check` passed for backend source and scripts.
- Focused regression tests: 16 passed, 0 failed.
- Deployment preflight: 31 passed, 0 failed.
- Package and lockfile JSON validated; Lucide dependency version matches the workspace entry.

## Not certified here

The package registry was unreachable from this environment (`EAI_AGAIN` DNS error), so the new npm dependency could not be downloaded locally. The full Vite build, React/Vitest suite and actual browser render therefore could not be run in this session. Run `npm ci` from the project root in an internet-connected environment, then run `npm run check` before deployment. The static archive also contains metadata rather than recordings; actual audio playback requires a licensed source configured for the project.
