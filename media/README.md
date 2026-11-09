# Local media folder

Put audio files here **only if you own them or are licensed to use them**, then
register each one to a song in **Admin › Providers & media › Playback media**.
Supported: mp3, m4a, aac, ogg, opus, wav, flac. File names: letters, digits, `.`, `_`, `-`.

The files are streamed only to signed-in users (`/api/media/:id`). Everything in this
folder except this README is git-ignored and excluded from the project ZIP.
Change the location with `LOCAL_MEDIA_DIR` (see docs/ENVIRONMENT.md).
