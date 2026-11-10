#!/usr/bin/env node
'use strict';

// Import the CC BY 4.0 Kaggle feature dataset into a separate staging table.
// The CSV's lyrics column is parsed only to preserve CSV field alignment and is
// deliberately never stored, logged, or sent to the application.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { query, one, pool } = require('../src/config/db');

const TOPIC_COLUMNS = [
  'dating', 'violence', 'world/life', 'night/time', 'shake the audience',
  'family/gospel', 'romantic', 'communication', 'obscene', 'music',
  'movement/places', 'light/visual perceptions', 'family/spiritual',
  'like/girls', 'sadness', 'feelings',
];
const REQUIRED = [
  'artist_name', 'track_name', 'release_date', 'genre', 'topic',
  'danceability', 'loudness', 'acousticness', 'instrumentalness', 'valence', 'energy',
  ...TOPIC_COLUMNS,
];
const BATCH_SIZE = 100;

function normalise(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

/** RFC-4180 single-record parser (the source CSV has one physical line per record). */
function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { fields.push(value); value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (quoted) throw new Error('CSV record ended inside a quoted field.');
  fields.push(value);
  return fields;
}

function finiteNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value in ${label}`);
  return n;
}

function toRecord(fields, index) {
  const artist = String(fields.artist_name || '').trim();
  const track = String(fields.track_name || '').trim();
  const year = Number(fields.release_date);
  const genre = String(fields.genre || '').trim().toLowerCase();
  const topic = String(fields.topic || '').trim().toLowerCase();
  if (!artist || !track || !genre || !topic || !Number.isInteger(year) || year < 1950 || year > 2019) return null;

  const unit = {};
  for (const key of ['energy', 'danceability', 'valence', 'acousticness', 'instrumentalness', ...TOPIC_COLUMNS]) {
    const value = finiteNumber(fields[key], key);
    if (value < 0 || value > 1) throw new Error(`Out-of-range ${key} on CSV row ${index}`);
    unit[key] = value;
  }
  const loudness = finiteNumber(fields.loudness, 'loudness');
  const normalizedArtist = normalise(artist);
  const normalizedTrack = normalise(track);
  const datasetKey = crypto.createHash('sha256')
    .update(`${normalizedArtist}| ${normalizedTrack}|${year}|${genre}`)
    .digest('hex');

  const topicScores = Object.fromEntries(TOPIC_COLUMNS.map((key) => [key, unit[key]]));
  return {
    datasetKey, artist, track, normalizedArtist, normalizedTrack, year, genre, topic,
    energy: unit.energy, danceability: unit.danceability, valence: unit.valence,
    acousticness: unit.acousticness, instrumentalness: unit.instrumentalness,
    loudness, topicScores: JSON.stringify(topicScores),
  };
}

const COLUMNS = [
  'dataset_key', 'artist_name', 'track_name', 'normalized_artist', 'normalized_track',
  'release_year', 'genre', 'topic', 'energy', 'danceability', 'valence', 'acousticness',
  'instrumentalness', 'loudness_db', 'topic_scores',
];
const UPDATE_COLUMNS = COLUMNS.slice(1).map((column) => `${column} = VALUES(${column})`).join(', ');

async function insertBatch(records) {
  if (!records.length) return;
  const tuple = `(${COLUMNS.map(() => '?').join(', ')})`;
  const values = records.map(() => tuple).join(', ');
  const params = [];
  for (const r of records) {
    params.push(r.datasetKey, r.artist, r.track, r.normalizedArtist, r.normalizedTrack,
      r.year, r.genre, r.topic, r.energy, r.danceability, r.valence, r.acousticness,
      r.instrumentalness, r.loudness, r.topicScores);
  }
  await query(
    `INSERT INTO kaggle_ceds_music_features (${COLUMNS.join(', ')}) VALUES ${values}
     ON DUPLICATE KEY UPDATE ${UPDATE_COLUMNS}, imported_at = CURRENT_TIMESTAMP`,
    params,
  );
}

async function run() {
  const supplied = process.argv[2];
  if (!supplied || supplied === '--help' || supplied === '-h') {
    console.log('Usage: npm run dataset:import -- /path/to/tcc_ceds_music.csv');
    console.log('You may also pass the KaggleHub download directory containing tcc_ceds_music.csv.');
    return;
  }

  const resolved = path.resolve(supplied);
  const csvPath = fs.statSync(resolved).isDirectory() ? path.join(resolved, 'tcc_ceds_music.csv') : resolved;
  if (!fs.existsSync(csvPath) || !fs.statSync(csvPath).isFile()) throw new Error(`CSV file not found: ${csvPath}`);

  const input = fs.createReadStream(csvPath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let batch = [];
  let rows = 0;
  let imported = 0;
  let skipped = 0;

  try {
    for await (const line of lines) {
      if (!headers) {
        headers = parseCsvLine(line).map((h) => h.trim());
        const missing = REQUIRED.filter((h) => !headers.includes(h));
        if (missing.length) throw new Error(`Dataset is missing required columns: ${missing.join(', ')}`);
        continue;
      }
      if (!line.trim()) continue;
      rows += 1;
      const values = parseCsvLine(line);
      if (values.length !== headers.length) {
        skipped += 1;
        continue;
      }
      const fields = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
      // Never read fields.lyrics: this dataset contains third-party lyrics.
      const record = toRecord(fields, rows + 1);
      if (!record) { skipped += 1; continue; }
      batch.push(record);
      if (batch.length >= BATCH_SIZE) {
        await insertBatch(batch);
        imported += batch.length;
        batch = [];
        if (imported % 5000 === 0) console.log(`Imported ${imported.toLocaleString()} feature rows…`);
      }
    }
    if (batch.length) {
      await insertBatch(batch);
      imported += batch.length;
    }
  } finally {
    lines.close();
    input.destroy();
  }

  // Link only exact artist + title + release-year matches. This does not create
  // songs or audio media, and an ambiguous/non-matching row remains unlinked.
  await query(
    `UPDATE kaggle_ceds_music_features k
       JOIN artists a ON LOWER(TRIM(a.name)) = LOWER(TRIM(k.artist_name))
       JOIN songs s ON s.primary_artist_id = a.artist_id
                   AND LOWER(TRIM(s.title)) = LOWER(TRIM(k.track_name))
                   AND s.release_year = k.release_year
        SET k.matched_song_id = s.song_id
      WHERE k.matched_song_id IS NULL`,
  );
  const summary = await one(
    'SELECT COUNT(*) AS total, COUNT(matched_song_id) AS matched FROM kaggle_ceds_music_features',
  );
  console.log(JSON.stringify({
    csv: path.basename(csvPath),
    rowsRead: rows,
    rowsUpserted: imported,
    skipped,
    datasetRowsStored: Number(summary.total),
    exactSongMatches: Number(summary.matched),
    lyricsStored: false,
    playableAudioImported: false,
  }, null, 2));
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`Kaggle feature import failed: ${error.message}`);
    process.exitCode = 1;
  }).finally(async () => {
    if (pool) await pool.end().catch(() => {});
  });
}

module.exports = { parseCsvLine, normalise, toRecord };
