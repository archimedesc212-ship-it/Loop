# LOOP — Basic Product Scope

Updated 10 November 2026

LOOP is being kept as a straightforward music discovery/listening application rather than a large collection of experimental modules.

## Normal listener features

1. **Account** — register, sign in, sign out and edit basic preferences.
2. **Home** — see a daily recommendation mix, popular catalogue entries and quick links.
3. **Discover** — select up to three moods, optionally describe a request and choose a simple activity context.
4. **Search** — find songs, artists, albums and genres in LOOP plus multiple international Apple Music storefronts; browse Bollywood, K-pop, Afrobeats, Latin, Arabic, Japanese and global selections.
5. **Player** — play licensed/local recordings and official Apple 30-second previews directly in LOOP using the persistent player; tracks without a preview use Apple's official inline embed. No popup is required. Tracks without a permitted match stay unavailable rather than using generated fake audio.
6. **Library** — create and delete playlists, add/remove songs, view liked songs and recent listening history.

## Creator and admin essentials

- Listeners can submit an artist application.
- Approved artists can submit a track with basic metadata, an audio file and a rights confirmation.
- New submissions are quarantined, scanned and reviewed before becoming public.
- Admins need only a small set of tools in the regular console: overview, catalogue, review queue, users and artist review.

## Design and navigation

- The regular navigation is limited to **Home, Discover, Search, Library and Settings**.
- Artist and admin areas appear only where the signed-in role allows them.
- The Mana Universal Icon Kit supplied with the project is integrated through `frontend/src/components/mana/Icon.jsx` and `lucide-react`.
- Icon components in `frontend/src/components/Icons.jsx` are compatibility aliases backed by Lucide so existing pages use the same icon system.
- The default UI uses a Spotify-inspired charcoal layout, green accents, album artwork, horizontal music shelves and a persistent bottom player while retaining LOOP branding.

## Kept out of the normal user flow

Mood Diary, LOOP World, personal analytics, Mood Dial, Mood Journey, database exploration, playlist health, experimental smart lists and most provider/operations panels are not exposed in the standard navigation. Their source/documentation can remain for the DBMS coursework and future extension, but they are not part of the basic product acceptance checklist.

## Acceptance checklist

- [ ] A listener can register/sign in and see Home.
- [ ] A listener can choose a mood or describe a request and receive recommendations.
- [ ] Search returns curated catalogue results and worldwide Apple catalogue results with artwork where supplied.
- [ ] A listener can play an Apple-provided short preview directly in the LOOP player; tracks without previews show the official Apple embed inline.
- [ ] A listener can like a song and create/edit/delete a playlist.
- [ ] A listener can view recent listening history where history is available.
- [ ] An artist can apply, and an approved artist can submit a recording.
- [ ] An admin can approve/reject artist applications and review track submissions.
- [ ] The production build and configured database integration tests pass before release.

## Known platform constraint

The supplied static music archive contains track metadata and audio features, not recordings or streaming URLs. Static/demo mode therefore searches multiple Apple storefronts. Where Apple supplies a preview URL, LOOP plays the official short preview directly in its persistent player; otherwise it renders the official Apple Music embed inline for a close title-and-artist match. Apple documents that listeners not logged in can hear a 30-second clip and listeners logged in to Apple Music can hear full tracks in the embed ([Apple Music Marketing Tools](https://artists.apple.com/support/1117-apple-music-marketing-tools)). Availability varies by track and region; if no close match exists, LOOP reports that instead of inventing audio. The embedded player does not expose reliable listening-progress events to LOOP, so embedded full-track plays are not counted as full listening-history records. Direct Apple preview playback is controlled by LOOP's HTML audio player. Full independent playback for every catalogue entry would still require licensed audio files or a separately configured streaming provider.
