# LOOP Mood Diary — privacy and behaviour

The Mood Diary is an optional, self-reported personal journal. It is not a clinical screening tool, mental-health assessment, or mood inference system.

## Data collected

- At most one check-in per account and calendar date.
- An optional selection from LOOP's existing mood catalogue.
- An optional note of up to 500 characters.
- Creation and update timestamps.

The browser supplies the calendar date so users in different time zones see their local day. The API accepts only the current local date, allowing a one-day UTC boundary difference, and rejects dates beyond that. The database unique key prevents duplicate daily entries.

## Access and use

The API reads and writes entries using the authenticated session's user ID. Client-supplied user IDs are not accepted. Deletion scopes by both entry ID and session user ID; another user's entry returns the same 404 response as a missing entry.

Diary entries are not exposed through public profiles, admin catalogue pages, playlist sharing, recommendation ranking, preference refresh, or model training. A check-in does not change the music LOOP recommends.

## Retention and deletion

Users can delete individual entries from the diary page. Deleting the account cascades to its diary entries. Password-confirmed personal-data export includes entries. Notes should be treated as private personal writing; users should avoid placing passwords, financial details, or other secrets in them.

## Demo mode

When `VITE_DEMO_MODE` is enabled, the diary uses browser-local storage and is not sent to a server. Clearing browser site data removes those demo entries. Server-backed accounts require the additive `0009_private_mood_diary.sql` migration.
