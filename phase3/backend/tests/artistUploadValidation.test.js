const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectAudio, safeUploadId, isSupportedAudioCodec } = require('../src/utils/audioSignature');
const { artistTerritoryAllows } = require('../src/utils/artistRights');

test('audio signature detection recognises supported containers', () => {
  const fixtures = [
    [Buffer.from('ID3\x04\x00\x00\x00'), 'mp3'],
    [Buffer.from([0xff, 0xfb, 0x90, 0x64]), 'mp3'],
    [Buffer.from('RIFF0000WAVEfmt '), 'wav'],
    [Buffer.from('fLaC0000'), 'flac'],
    [Buffer.from('OggS0000'), 'ogg'],
    [Buffer.from('0000ftypM4A '), 'm4a'],
    [Buffer.from([0xff, 0xf1, 0x50, 0x80]), 'aac'],
  ];
  for (const [bytes, expected] of fixtures) assert.equal(detectAudio(bytes)?.ext, expected);
});

test('audio signature detection rejects unsupported and truncated buffers', () => {
  assert.equal(detectAudio(Buffer.from('not audio data')), null);
  assert.equal(detectAudio(Buffer.from('RIFF')), null);
  assert.equal(detectAudio('ID3'), null);
  assert.equal(detectAudio(null), null);
});

test('upload identifiers are exactly 32 lowercase hexadecimal characters', () => {
  assert.equal(safeUploadId('0123456789abcdef0123456789abcdef'), true);
  assert.equal(safeUploadId('../0123456789abcdef0123456789ab'), false);
  assert.equal(safeUploadId('0123456789ABCDEF0123456789ABCDEF'), false);
  assert.equal(safeUploadId(''), false);
});

test('artist territory grants fail closed and honour profile country', () => {
  assert.equal(artistTerritoryAllows(['WORLDWIDE'], null), true);
  assert.equal(artistTerritoryAllows(['IN', 'GB'], { regionCode: 'IN-DL' }), true);
  assert.equal(artistTerritoryAllows(['IN', 'GB'], { regionCode: 'US-CA' }), false);
  assert.equal(artistTerritoryAllows(['IN'], null), false);
  assert.equal(artistTerritoryAllows('not-json', { regionCode: 'IN' }), false);
  assert.equal(artistTerritoryAllows([], { regionCode: 'IN' }), false);
});

test('media probe accepts supported audio codecs and rejects unsupported codecs', () => {
  for (const codec of ['mp3', 'aac', 'flac', 'vorbis', 'opus', 'pcm_s16le']) assert.equal(isSupportedAudioCodec(codec), true);
  assert.equal(isSupportedAudioCodec('h264'), false);
  assert.equal(isSupportedAudioCodec(null), false);
});
