const { query, one, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

async function ensureSong(songId) {
  const song = await one('SELECT song_id FROM songs WHERE song_id = ? AND status = \'ACTIVE\'', [songId]);
  if (!song) throw ApiError.notFound('Song');
}
async function get(songId, userId) {
  await ensureSong(songId);
  const lyric = await one(
    `SELECT lyric_id AS id, language_code AS languageCode, source_type AS sourceType,
            source_label AS sourceLabel, source_url AS sourceUrl, supplied_by AS suppliedBy
       FROM song_lyrics WHERE song_id = ? ORDER BY updated_at DESC LIMIT 1`, [songId]);
  const note = await one('SELECT note_id AS id, note_text AS text, updated_at AS updatedAt FROM user_song_notes WHERE user_id = ? AND song_id = ?', [userId, songId]);
  if (!lyric) return { lyric: null, lines: [], note, favourite: !!(await one('SELECT 1 AS yes FROM user_likes WHERE user_id = ? AND song_id = ?', [userId, songId])) };
  const lines = await query(
    `SELECT ll.lyric_line_id AS id, ll.line_number AS lineNumber, ll.start_ms AS startMs,
            ll.end_ms AS endMs, ll.lyric_text AS text,
            la.annotation_id AS annotationId, la.annotation_text AS annotation,
            la.source_url AS annotationSourceUrl, la.user_id AS annotationUserId
       FROM lyric_lines ll
       LEFT JOIN lyric_annotations la ON la.lyric_line_id = ll.lyric_line_id
         AND (la.user_id = ? OR la.is_private = 0)
      WHERE ll.lyric_id = ? ORDER BY ll.line_number, la.updated_at DESC`, [userId, lyric.id]);
  const mapped = [];
  for (const row of lines) {
    let line = mapped[mapped.length - 1];
    if (!line || line.id !== row.id) {
      line = { id: row.id, lineNumber: row.lineNumber, startMs: row.startMs, endMs: row.endMs, text: row.text, annotations: [] };
      mapped.push(line);
    }
    if (row.annotationId) line.annotations.push({ id: row.annotationId, text: row.annotation, sourceUrl: row.annotationSourceUrl, mine: Number(row.annotationUserId) === Number(userId) });
  }
  return { lyric, lines: mapped, note, favourite: !!(await one('SELECT 1 AS yes FROM user_likes WHERE user_id = ? AND song_id = ?', [userId, songId])) };
}
async function saveLyrics(songId, userId, input) {
  await ensureSong(songId);
  if (!input.rightsConfirmed || !['USER_PROVIDED', 'LICENSED'].includes(input.sourceType)) throw ApiError.badRequest('Confirm that you own or are licensed to provide these lyrics.');
  if (!Array.isArray(input.lines) || !input.lines.length) throw ApiError.badRequest('Add at least one lyric line.');
  for (let i = 0; i < input.lines.length; i += 1) {
    const line = input.lines[i];
    if (!Number.isInteger(line.startMs) || line.startMs < 0 || !String(line.text || '').trim()) throw ApiError.badRequest('Each lyric line needs text and a non-negative timestamp.');
    if (i && line.startMs < input.lines[i - 1].startMs) throw ApiError.badRequest('Lyric timestamps must be in ascending order.');
  }
  await withTransaction(async (tx) => {
    const existing = await tx.one('SELECT lyric_id, supplied_by FROM song_lyrics WHERE song_id = ? AND language_code = ?', [songId, input.languageCode || 'und']);
    let lyricId;
    if (existing) {
      if (Number(existing.supplied_by) !== Number(userId)) throw ApiError.forbidden('Only the contributor who supplied this lyric set may replace it.');
      lyricId = existing.lyric_id;
      await tx.query('UPDATE song_lyrics SET source_type = ?, source_label = ?, source_url = ?, rights_confirmed = 1, supplied_by = ? WHERE lyric_id = ?', [input.sourceType, input.sourceLabel, input.sourceUrl || null, userId, lyricId]);
      await tx.query('DELETE FROM lyric_lines WHERE lyric_id = ?', [lyricId]);
    } else {
      const result = await tx.query('INSERT INTO song_lyrics (song_id, language_code, source_type, source_label, source_url, rights_confirmed, supplied_by) VALUES (?, ?, ?, ?, ?, 1, ?)', [songId, input.languageCode || 'und', input.sourceType, input.sourceLabel, input.sourceUrl || null, userId]);
      lyricId = result.insertId;
    }
    for (let i = 0; i < input.lines.length; i += 1) {
      const line = input.lines[i];
      await tx.query('INSERT INTO lyric_lines (lyric_id, line_number, start_ms, end_ms, lyric_text) VALUES (?, ?, ?, ?, ?)', [lyricId, i + 1, line.startMs, line.endMs ?? null, String(line.text).trim()]);
    }
  }, { actorId: userId });
  return get(songId, userId);
}
async function addAnnotation(songId, lineId, userId, text, sourceUrl) {
  const owned = await one('SELECT ll.lyric_line_id FROM lyric_lines ll JOIN song_lyrics sl ON sl.lyric_id = ll.lyric_id WHERE ll.lyric_line_id = ? AND sl.song_id = ?', [lineId, songId]);
  if (!owned) throw ApiError.notFound('Lyric line');
  const result = await query('INSERT INTO lyric_annotations (lyric_line_id, user_id, annotation_text, source_url, is_private) VALUES (?, ?, ?, ?, 1)', [lineId, userId, text.trim(), sourceUrl || null]);
  return { id: result.insertId, text: text.trim(), sourceUrl: sourceUrl || null, mine: true };
}
async function deleteAnnotation(annotationId, userId) {
  const result = await query('DELETE FROM lyric_annotations WHERE annotation_id = ? AND user_id = ?', [annotationId, userId]);
  if (!result.affectedRows) throw ApiError.notFound('Your annotation');
  return { deleted: true };
}
async function saveNote(songId, userId, text) {
  await ensureSong(songId);
  const clean = String(text || '').trim();
  if (!clean) {
    await query('DELETE FROM user_song_notes WHERE song_id = ? AND user_id = ?', [songId, userId]);
    return { note: null };
  }
  await query(`INSERT INTO user_song_notes (user_id, song_id, note_text) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE note_text = VALUES(note_text)`, [userId, songId, clean]);
  return { note: await one('SELECT note_id AS id, note_text AS text, updated_at AS updatedAt FROM user_song_notes WHERE user_id = ? AND song_id = ?', [userId, songId]) };
}
module.exports = { get, saveLyrics, addAnnotation, deleteAnnotation, saveNote };
