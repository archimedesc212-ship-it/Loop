// File signature checks for the audio formats accepted by the artist upload pipeline.
// ffprobe remains the authoritative container/duration parser after malware scanning.
const SUPPORTED_AUDIO_CODECS = new Set([
  'mp3', 'aac', 'flac', 'vorbis', 'opus',
  'pcm_u8', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_f64le',
]);

const AUDIO_TYPES = Object.freeze({
  mp3: Object.freeze({ ext: 'mp3', mime: 'audio/mpeg' }),
  m4a: Object.freeze({ ext: 'm4a', mime: 'audio/mp4' }),
  wav: Object.freeze({ ext: 'wav', mime: 'audio/wav' }),
  flac: Object.freeze({ ext: 'flac', mime: 'audio/flac' }),
  ogg: Object.freeze({ ext: 'ogg', mime: 'audio/ogg' }),
  aac: Object.freeze({ ext: 'aac', mime: 'audio/aac' }),
});

function detectAudio(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') return AUDIO_TYPES.mp3;
  if (buffer.length >= 2 && buffer[0] === 0xff && [0xf1, 0xf9].includes(buffer[1])) return AUDIO_TYPES.aac;
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return AUDIO_TYPES.mp3;
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') return AUDIO_TYPES.wav;
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'fLaC') return AUDIO_TYPES.flac;
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') return AUDIO_TYPES.ogg;
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return AUDIO_TYPES.m4a;
  return null;
}

const safeUploadId = (value) => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const isSupportedAudioCodec = (value) => typeof value === 'string' && SUPPORTED_AUDIO_CODECS.has(value.toLowerCase());

module.exports = { AUDIO_TYPES, SUPPORTED_AUDIO_CODECS, detectAudio, safeUploadId, isSupportedAudioCodec };
