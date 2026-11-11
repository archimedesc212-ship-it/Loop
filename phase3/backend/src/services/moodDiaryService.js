'use strict';

const { query, one } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { validateMoodDiaryDate } = require('../utils/moodDiaryDate');

/**
 * Optional self-reported check-ins. Entries are private to their owner and are
 * intentionally not consumed by recommendation or model-training pipelines.
 */
async function list(userId, days = 90, asOfDate = null) {
  const windowDays = Math.max(1, Math.min(365, Number(days) || 90));
  const anchorDate = asOfDate ? validateMoodDiaryDate(asOfDate) : new Date().toISOString().slice(0, 10);
  return query(
    `SELECT e.entry_id AS entryId, e.checkin_date AS checkinDate, e.mood_id AS moodId,
            m.name AS moodName, m.emoji AS moodEmoji, m.color_hex AS moodColor,
            e.note, e.created_at AS createdAt, e.updated_at AS updatedAt
       FROM mood_diary_entries e
       LEFT JOIN moods m ON m.mood_id = e.mood_id
      WHERE e.user_id = ? AND e.checkin_date >= DATE_SUB(?, INTERVAL ? DAY)
      ORDER BY e.checkin_date DESC, e.entry_id DESC`, [userId, anchorDate, windowDays]);
}

async function saveToday(userId, { checkinDate, moodId, note }) {
  const day = validateMoodDiaryDate(checkinDate);
  if (moodId === undefined && note === undefined) {
    throw ApiError.badRequest('Choose a mood or add a note before saving a check-in.');
  }
  if (moodId !== undefined) {
    const mood = await one('SELECT mood_id FROM moods WHERE mood_id = ?', [moodId]);
    if (!mood) throw new ApiError(422, 'INVALID_MOOD', 'Choose a mood from the available list.');
  }
  const existing = await one(
    `SELECT mood_id AS moodId, note FROM mood_diary_entries WHERE user_id = ? AND checkin_date = ?`, [userId, day]);
  const nextMoodId = moodId !== undefined ? moodId : existing?.moodId ?? null;
  const nextNote = note !== undefined ? (String(note).trim() || null) : existing?.note ?? null;
  if (nextMoodId === null && nextNote === null) {
    throw ApiError.badRequest('A check-in needs a mood or a note.');
  }
  await query(
    `INSERT INTO mood_diary_entries (user_id, checkin_date, mood_id, note)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mood_id = VALUES(mood_id), note = VALUES(note), updated_at = CURRENT_TIMESTAMP`,
    [userId, day, nextMoodId, nextNote]);
  return one(
    `SELECT e.entry_id AS entryId, e.checkin_date AS checkinDate, e.mood_id AS moodId,
            m.name AS moodName, m.emoji AS moodEmoji, m.color_hex AS moodColor,
            e.note, e.created_at AS createdAt, e.updated_at AS updatedAt
       FROM mood_diary_entries e LEFT JOIN moods m ON m.mood_id = e.mood_id
      WHERE e.user_id = ? AND e.checkin_date = ?`, [userId, day]);
}

async function remove(userId, entryId) {
  const result = await query('DELETE FROM mood_diary_entries WHERE entry_id = ? AND user_id = ?', [entryId, userId]);
  if (!result.affectedRows) throw ApiError.notFound('Mood diary entry');
  return { deleted: true, entryId };
}

module.exports = { list, saveToday, remove };
