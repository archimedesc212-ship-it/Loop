# Music playback and recommendation integration

## Recommendation method

The user-supplied Spotify notebook recommends tracks by averaging the numerical feature vectors of the seed songs, standardising the catalogue and seed vector, then ranking by cosine distance. LOOP ports this method in `frontend/src/lib/spotifySimilarity.js` and uses it for similar-track recommendations and the daily mix when the listener has liked songs.

LOOP's current music catalogue contains only these relevant numeric values: energy, valence, danceability, acousticness, instrumentalness, loudnessIndex and releaseYear. It does not contain every Spotify field expected by the notebook. The app uses only the available fields. The attached notebook's referenced `data.csv`, `data_by_genres.csv`, `data_by_year.csv`, and Spotify API credentials were not part of the upload.

## How songs play

Most catalogue entries are metadata records, not audio files. When a listener selects one, LOOP searches Apple's public music catalogue using the title and artist, accepts only a close title-and-artist match, then opens Apple's official embedded music player. The embedded player handles the audio. In supported regions, a listener without an Apple Music subscription may hear a short preview; a subscriber may be able to play the full song. Availability varies by track and region. The listener can also open the matching Apple Music page in a new tab.

LOOP does not download, copy, proxy, or persist Apple preview/full-track audio. It does not claim that the Apple embed's listening position or playback events are available to LOOP; consequently external embedded plays are not counted as full listening-history events by LOOP. Artist-uploaded/licensed files continue to use the existing local-media route.

## What is required for full catalogue playback

For full-length playback of every track, the project needs a legitimate provider or licensed audio files and a persistent media-storage/CDN configuration. A metadata dataset or Spotify recommendation notebook does not include the actual recordings or grant playback rights. Do not put API secrets in frontend code; configure provider credentials on the server only where the provider permits it.

## Official provider documentation

- [Apple Music Marketing Tools — Embeddable Player](https://artists.apple.com/support/1117-apple-music-marketing-tools)
- [Apple Music API](https://developer.apple.com/documentation/AppleMusicAPI)
