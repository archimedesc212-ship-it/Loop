# Kaggle music-feature dataset import

This is a **feature/metadata import**, not an audio import.

## Source

Kaggle dataset: [Music Dataset: 1950 to 2019](https://www.kaggle.com/datasets/saurabhshahane/music-dataset-1950-to-2019)

The uploaded archive contains `tcc_ceds_music.csv` with 28,372 records spanning 1950–2019. It includes artist/title/year, genre/topic labels and numerical features such as danceability, loudness, acousticness, instrumentalness, valence and energy. The file also contains a `lyrics` column. The importer deliberately ignores that column and never stores it.

The dataset is published under **CC BY 4.0**. Preserve attribution to the Kaggle dataset and its stated upstream sources when using the imported feature data. Review the dataset card and attribution requirements before public/commercial use.

## Public static archive build

The current Cloudflare Workers / Vercel static frontend uses this actual dataset directly, rather than the fictional MySQL development seed. `npm run build` runs `scripts/prepare-music-catalog.js` first. That script downloads the CSV from the upstream source and refuses to continue unless its SHA-256 matches the uploaded CSV: `046b8e714bb037b5960429a9a4bdfc205530c81e0617ef39a328307c9f9e1173`. The matching upload is 27,655,251 bytes and the ZIP contains that same CSV. The script verifies all 28,372 rows and generates a compact JSON catalogue for the frontend.

Only metadata and numerical features are published; the `lyrics` column is not copied. Mood labels are estimates derived from topic/audio features. The upload has no audio recordings, preview URLs, durations, language, albums or film metadata, so these remain unavailable and playback is disabled.

## What the import does

- Creates/uses the separate MySQL table `kaggle_ceds_music_features` through migration `0005_theaudiodb_kaggle_features.sql`.
- Imports the numerical features, year, genre and topic in batches of 100 rows.
- Uses a deterministic dataset key, so re-running the import upserts rather than duplicating the same records.
- Links rows to existing LOOP catalogue songs only when artist, title and year match exactly.
- Leaves unmatched rows in the feature staging table.

It does **not** create new playable song catalogue entries, change existing song audio features, invent durations, download MP3s, or provide a playback URL. The source CSV does not contain audio files or reliable track durations. The existing recommendation engine does not automatically consume these staging rows yet; a separately reviewed feature-normalisation and recommendation integration is needed for that.

## Import steps

1. Download the dataset using KaggleHub:

   ```python
   import kagglehub

   path = kagglehub.dataset_download("saurabhshahane/music-dataset-1950-to-2019")
   print("Path to dataset files:", path)
   ```

   Install KaggleHub first with `python -m pip install kagglehub` and authenticate to Kaggle if prompted. The downloaded folder should contain `tcc_ceds_music.csv`.

2. Configure the MySQL owner/runtime credentials from `.env`. Back up the target database first.

3. Apply the non-destructive migration (do **not** run `npm run db:setup`, which drops and recreates the database):

   ```bash
   npm run db:migrate
   ```

4. Run the importer from the repository root:

   ```bash
   npm run dataset:import -- /path/to/tcc_ceds_music.csv
   ```

   You can pass the KaggleHub download directory instead of the CSV path. The script prints read/imported/skipped/matched counts. It does not print or store lyrics.

5. Verify the staging table:

   ```sql
   SELECT COUNT(*) AS imported_rows,
          COUNT(matched_song_id) AS matched_catalogue_songs
     FROM kaggle_ceds_music_features;
   ```

## Uploaded ZIP

The uploaded `archive.zip` is a copy of the Kaggle CSV archive. Extract it locally (for example, `unzip archive.zip -d kaggle-data`) and pass `kaggle-data/tcc_ceds_music.csv` to the importer. The dataset itself is not committed to GitHub; only the importer and schema migration are tracked.
