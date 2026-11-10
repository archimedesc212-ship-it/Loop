# LOOP UI and music-assistant release note

Date: 10 November 2026

## Implemented in this release

- Added a dedicated `/assistant` route in the signed-in application.
- Added six usable starter prompts and a free-text composer with Enter-to-send and Shift+Enter for a new line.
- Connected the assistant to the existing `POST /recommendations/mood` API. Successful responses render LOOP recommendation lists, interpretation details, playback actions and the existing save-as-playlist flow.
- Added error and empty-result handling, suggestion retries and a link to full mood discovery.
- The conversation remains in React page state only; it is not stored in a separate server-side chat-history table. This avoids silently retaining free-text mood prompts.
- Added Assistant to desktop and mobile navigation, plus a desktop collapsible sidebar with a saved UI preference.
- Changed the Home featured music block to rotate through available embeddable YouTube results, with manual previous/next/dot controls and a Play featured action. The player continues to use the official YouTube iframe.
- Added responsive styles for the assistant composer, message thread, prompt cards, rotating hero and collapsed navigation.

## Existing integrations reused

The release reuses the current YouTube Data API adapter, official YouTube embed playback, MusicBrainz metadata and Cover Art Archive artwork lookup, Apple Music worldwide search/preview/embed, the current recommendation service, playlist service, listening history and account controls. It does not replace the backend provider logic or claim that third-party services always return a playable item.

## External requirements

- YouTube search requires `YOUTUBE_ENABLED=true` and a server-side `YOUTUBE_API_KEY`.
- MusicBrainz requires `MUSICBRAINZ_ENABLED=true` and a descriptive `MUSICBRAINZ_USER_AGENT`.
- The database-backed profile requires the configured MySQL database, migrations and session/security environment values.
- The optional Anthropic fallback is used only by the existing mood interpretation path and requires `AI_PROVIDER=anthropic`, `AI_API_KEY` and `AI_MODEL`. The new assistant is not a general-purpose LLM chat service.
- YouTube videos can still be unavailable when owners disable embedding or when territorial restrictions apply. Full-length commercial playback needs an authorised source; a YouTube API key does not grant audio extraction rights.

## Verification performed for this release

- TypeScript compiler parser/transpiler inspected 68 frontend `.js`/`.jsx` files: zero syntax diagnostics.
- `node --check` passed for backend JavaScript files.
- `node scripts/deployment-preflight.js`: 31 passed, 0 failed.
- `npm ci --ignore-scripts --no-audit --no-fund` did not finish in this environment, so Vite production build, Vitest, ESLint and database-backed integration suites could not be executed here.

## Not a completion claim

The 120-item expansion inventory remains a roadmap and is not represented as 120 implemented features. This release implements the UI/assistant additions listed above and reuses existing features. A full production launch still requires dependency-backed build/test execution and live provider/database verification in the deployment environment.
