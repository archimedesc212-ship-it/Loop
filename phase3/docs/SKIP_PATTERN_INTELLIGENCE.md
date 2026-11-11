# LOOP skip-pattern intelligence

## What it measures

`GET /api/insights/skip-patterns?days=30` returns skip analytics for the authenticated listener. The permitted window is 7–365 days (default 30). It groups the listener's own `listening_history` rows by primary genre, primary artist, active-model primary song mood, listening-session context, hour of day and song.

The endpoint deliberately reports skips as observed listening events, not as a judgement that a song, artist or genre is bad. Categories with fewer than two plays are omitted from rate rankings to reduce small-sample noise. A song can appear in the most-skipped list only when at least one skip exists.

## Privacy and data handling

- Every query is scoped by `listening_history.user_id = req.user.id`.
- Session context is joined using both `session_id` and `user_id`.
- The endpoint does not expose other users' rows or account/session identifiers.
- It reads existing tables and views only; no migration is required.
- Private-session playback is not written to permanent `listening_history` by the current playback design, so it is not included.

## UI

The listening profile shows the period totals, skip rate and average completion, followed by rankings for genres, artists, music moods and contexts, and a most-skipped song list. The wording makes clear that skip rate is descriptive and does not establish dislike or content quality.

## Verification boundary

The route, service, API client and profile UI are implemented. The MySQL-backed endpoint test and multi-account isolation test remain release gates; they must pass against MySQL 8 before the feature is marked VERIFIED.
