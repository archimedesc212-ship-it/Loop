#!/usr/bin/env node
/* global require, __dirname, process, console, fetch, AbortSignal, Buffer, module */
'use strict';

// Build the public, metadata-only LOOP music catalogue from the exact CSV supplied
// by the project owner. The downloaded source is checksum-pinned. Lyrics are read
// only as a CSV field for column alignment; they are never copied into the output.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const EXPECTED_SHA256 = '046b8e714bb037b5960429a9a4bdfc205530c81e0617ef39a328307c9f9e1173';
const EXPECTED_RECORDS = 28372;
const SOURCE_URL = 'https://huggingface.co/datasets/chloeliu/lyrics/resolve/main/tcc_ceds_music.csv?download=true';
const TOPIC_COLUMNS = [
  'dating', 'violence', 'world/life', 'night/time', 'shake the audience',
  'family/gospel', 'romantic', 'communication', 'obscene', 'music',
  'movement/places', 'light/visual perceptions', 'family/spiritual',
  'like/girls', 'sadness', 'feelings',
];
const REQUIRED = [
  'artist_name', 'track_name', 'release_date', 'genre', 'topic',
  'energy', 'valence', 'danceability', 'acousticness', 'instrumentalness', 'loudness',
  ...TOPIC_COLUMNS,
];

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
  if (quoted) throw new Error('A CSV row ended inside a quoted field.');
  fields.push(value);
  return fields;
}

function roundedUnit(fields, index, key, rowNumber) {
  const value = Number(fields[index.get(key)]);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid ${key} feature on CSV row ${rowNumber}.`);
  }
  return Math.round(value * 1000) / 1000;
}

async function sourceBytes() {
  const supplied = process.env.LOOP_MUSIC_CSV;
  if (supplied) {
    const resolved = path.resolve(supplied);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`LOOP_MUSIC_CSV does not point to a file: ${resolved}`);
    }
    return fs.readFileSync(resolved);
  }

  const response = await fetch(SOURCE_URL, {
    headers: { 'user-agent': 'LOOP-Music-Catalogue/1.0', accept: 'text/csv,*/*' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Dataset source returned HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function build() {
  const bytes = await sourceBytes();
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`Dataset checksum mismatch. Expected ${EXPECTED_SHA256}, received ${sha256}. Refusing to publish unverified data.`);
  }

  const input = readline.createInterface({
    input: require('node:stream').Readable.from(bytes.toString('utf8').split(/(?<=\n)/)),
    crlfDelay: Infinity,
  });
  let headers = null;
  let index = null;
  const artistIds = new Map();
  const genreIds = new Map();
  const records = [];
  let rowNumber = 0;

  try {
    for await (const rawLine of input) {
      const line = rawLine.replace(/\n$/, '');
      if (!headers) {
        headers = parseCsvLine(line).map((value) => value.trim());
        index = new Map(headers.map((name, i) => [name, i]));
        const missing = REQUIRED.filter((name) => !index.has(name));
        if (missing.length) throw new Error(`Dataset is missing columns: ${missing.join(', ')}`);
        continue;
      }
      if (!line.trim()) continue;
      rowNumber += 1;
      const fields = parseCsvLine(line);
      if (fields.length !== headers.length) {
        throw new Error(`CSV column count mismatch on row ${rowNumber + 1}.`);
      }
      const value = (name) => fields[index.get(name)] || '';
      const artist = value('artist_name').trim();
      const title = value('track_name').trim();
      const year = Number(value('release_date'));
      const genre = value('genre').trim().toLowerCase();
      const topic = value('topic').trim().toLowerCase();
      if (!artist || !title || !genre || !topic || !Number.isInteger(year) || year < 1950 || year > 2019) {
        throw new Error(`Invalid catalogue metadata on CSV row ${rowNumber + 1}.`);
      }

      if (!artistIds.has(artist)) artistIds.set(artist, artistIds.size + 1);
      if (!genreIds.has(genre)) genreIds.set(genre, genreIds.size + 1);
      const topTopics = TOPIC_COLUMNS
        .map((name) => [name, roundedUnit(fields, index, name, rowNumber + 1)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      // Compact tuple: id, artist id, title, year, genre id, topic,
      // energy, valence, danceability, acousticness, instrumentalness,
      // normalized loudness index, top three topic signals.
      records.push([
        records.length + 1, artistIds.get(artist), title, year, genreIds.get(genre), topic,
        roundedUnit(fields, index, 'energy', rowNumber + 1),
        roundedUnit(fields, index, 'valence', rowNumber + 1),
        roundedUnit(fields, index, 'danceability', rowNumber + 1),
        roundedUnit(fields, index, 'acousticness', rowNumber + 1),
        roundedUnit(fields, index, 'instrumentalness', rowNumber + 1),
        roundedUnit(fields, index, 'loudness', rowNumber + 1),
        topTopics,
      ]);
    }
  } finally {
    input.close();
  }

  if (records.length !== EXPECTED_RECORDS) {
    throw new Error(`Expected ${EXPECTED_RECORDS.toLocaleString()} catalogue rows, received ${records.length.toLocaleString()}.`);
  }

  const catalogue = {
    schemaVersion: 1,
    source: {
      title: 'Music Dataset: 1950 to 2019',
      authors: ['Luan Moura', 'Emanuel Fontelles', 'Vinicius Sampaio', 'Mardônio França'],
      kaggle: 'https://www.kaggle.com/datasets/saurabhshahane/music-dataset-1950-to-2019',
      doi: 'https://doi.org/10.17632/3t9vbwxgr5.3',
      license: 'CC BY 4.0',
      sha256,
      recordCount: records.length,
      yearRange: [1950, 2019],
      lyricsIncluded: false,
      audioIncluded: false,
      durationIncluded: false,
      languageIncluded: false,
    },
    artists: [...artistIds.entries()].map(([name, id]) => [id, name]),
    genres: [...genreIds.entries()].map(([name, id]) => [id, name]),
    records,
  };

  const output = path.resolve(__dirname, '../frontend/public/data/music-catalog.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(catalogue));
  console.log(`LOOP catalogue prepared: ${records.length.toLocaleString()} tracks, ${artistIds.size.toLocaleString()} artists, ${genreIds.size} genres.`);
  console.log('Lyrics excluded. No audio files, durations or language labels were present in the source.');
  console.log(`Verified SHA-256: ${sha256}`);
}

if (require.main === module) {
  build().catch((error) => {
    console.error(`LOOP catalogue build failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseCsvLine, roundedUnit };
