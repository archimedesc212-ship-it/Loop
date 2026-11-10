'use strict';

const ApiError = require('./ApiError');

/** Accept a browser-local calendar date while preventing arbitrary backdating. */
function validateMoodDiaryDate(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw ApiError.badRequest('A valid calendar date is required.');
  }
  const requested = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(requested) || new Date(requested).toISOString().slice(0, 10) !== value) {
    throw ApiError.badRequest('A valid calendar date is required.');
  }
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Math.abs(requested - utcToday) > 86400000) {
    throw ApiError.badRequest('Mood diary check-ins are limited to the current local calendar day. Check your device date and time.');
  }
  return value;
}

module.exports = { validateMoodDiaryDate };
