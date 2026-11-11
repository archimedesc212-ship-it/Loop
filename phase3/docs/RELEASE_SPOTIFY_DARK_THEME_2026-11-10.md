# LOOP dark theme update — 10 November 2026

## What changed

- Replaced the light `rewear-inspired.css` import with `spotify-dark.css`.
- Standardised the palette around black (`#000000`), charcoal surfaces (`#121212`, `#1e1e1e`), white text and LOOP green (`#1ed760`).
- Refined the app frame into separate dark navigation and content panels with a docked desktop player.
- Restyled cards, search, buttons, forms, banner, assistant composer and player for the dark palette.
- Added mobile layout overrides for the docked player and bottom navigation.
- Removed the unused light-theme stylesheet to prevent it from overriding the dark palette again.

## What did not change

This is a visual/theme update. It does not add new playback rights, API credentials, catalogue recordings, database infrastructure or new backend features. Existing pages, endpoints, authentication and playback integrations remain in place.

## Validation status

The release process should run the JavaScript/JSX syntax checks, CSS parser, deployment preflight and ZIP integrity check. A full production Vite build and browser/device visual QA require the project's dependencies and should be run before promoting the ZIP to production.
