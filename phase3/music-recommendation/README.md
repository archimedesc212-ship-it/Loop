# Music recommendation model used by LOOP

The supplied `notebooks/spotify-music-recommendation.ipynb` is preserved as the reference notebook. LOOP ports the notebook's seed-song recommendation method into `frontend/src/lib/spotifySimilarity.js`:

1. select one or more seed tracks;
2. take the mean of their numeric audio-feature vectors;
3. standardise feature values using the catalogue's mean and standard deviation;
4. rank other tracks by cosine distance from the standardised seed centroid;
5. exclude the seed tracks from the result.

The source notebook's `number_cols` list has 15 Spotify fields (including duration, explicitness, key, liveness, popularity, speechiness and tempo). Those CSV fields are **not all present** in LOOP's bundled catalogue. LOOP deliberately uses only the fields actually supplied by its current catalogue: `energy`, `valence`, `danceability`, `acousticness`, `instrumentalness`, `loudnessIndex` and `releaseYear`. Do not fabricate missing values. If a richer licensed catalogue is added later, the feature list can be expanded.

The original notebook also refers to external `data.csv`, `data_by_genres.csv` and `data_by_year.csv` files and Spotify Client Credentials. Those data files and credentials were not included with the uploaded notebook. The notebook is included for transparency/reference; its original end-to-end Kaggle/Spotify cells are not run by the LOOP app.


## Playback reference

LOOP uses Apple's official embedded-player model for catalogue matches. Apple documents that listeners who are not logged in can play a 30-second song clip in the embed, while listeners logged in to Apple Music can hear full tracks: https://artists.apple.com/support/1117-apple-music-marketing-tools. Apple's developer documentation describes the Music catalog and search resources: https://developer.apple.com/documentation/AppleMusicAPI.
