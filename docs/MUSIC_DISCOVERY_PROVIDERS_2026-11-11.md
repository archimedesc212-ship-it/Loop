# LOOP music discovery providers — 11 November 2026

## What changed

- Added browser-side Openverse audio search with anonymous API access (no key required).
- Added mapping and validation for music results with HTTPS stream/source/licence URLs and known CC/public-domain identifiers.
- Added Openverse result cards with creator, duration, source, artist link, licence link and attribution details.
- Added direct playback through the existing audio player. LOOP does not download, cache, proxy, convert or re-host the remote audio.
- Added clear Openverse non-endorsement notice and independent licence-verification reminder.
- Added a Spotify hand-off link that opens Spotify's official search page. No Spotify token, catalogue data or streams are used inside LOOP.
- Kept YouTube discovery on the server-side YouTube Data API and playback in the official visible YouTube embed. No extraction, audio-only conversion, hidden/background player or re-hosting is implemented.

## Why Spotify is a hand-off instead of embedded playback

Spotify's current Developer Policy prohibits integrating Spotify streams/content with another service and prohibits products that mimic or replace Spotify's core experience without written permission. It also limits streaming to Premium subscribers and applies further restrictions to commercial use. Because LOOP is a multi-provider product, this release deliberately does not call the Spotify API or Web Playback SDK. A Spotify Client ID/secret, access token or Premium account is not by itself an exception. See https://developer.spotify.com/policy and https://developer.spotify.com/documentation/web-playback-sdk.

## Openverse licence caution

Openverse aggregates third-party metadata and does not verify the licence of each work. Verify the original source and licence before relying on a result. LOOP presents creator/source/licence links and the provider-supplied attribution. CC-NC material is not for commercial use; ND works must not be adapted; follow SA requirements for adaptations. Openverse API usage must respect its rate limits and terms. See https://docs.openverse.org/api/reference/made_with_ov.html and https://docs.openverse.org/_preview/2205/terms_of_service.html.

## Setup

- Openverse: no credential or environment variable. Search runs from the browser against `https://api.openverse.org/v1/audio/`.
- YouTube: retain `YOUTUBE_ENABLED=true` and configure the YouTube Data API key on the backend. The project must keep the official YouTube player visible and intact.
- Jamendo: optional; enable only after the developer app Client ID is available.
- Spotify: no key is consumed; the Search page links to Spotify's own search experience.

## Verification boundary

The project contains mock tests for Openverse mapping/search and Spotify link construction. Browser playback against live original source URLs, current provider quotas, YouTube embed availability, and owner-side credentials must be tested in the deployed environment. The build environment used for this update did not have the project's npm dependencies installed and did not have outbound network access, so a full Vite build, full Vitest suite and live API checks could not be run here.
