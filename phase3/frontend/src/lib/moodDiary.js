/** Pure helpers for a private, once-per-calendar-day mood diary. */
export function diaryDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function upsertDiaryEntry(entries, entry) {
  return [entry, ...(Array.isArray(entries) ? entries : []).filter((item) => item.checkinDate !== entry.checkinDate)]
    .sort((a, b) => b.checkinDate.localeCompare(a.checkinDate));
}

export function removeDiaryEntry(entries, entryId) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => Number(entry.entryId) !== Number(entryId));
}

/** Build a Monday-first calendar grid, preserving the browser's local calendar dates. */
export function moodCalendarDays(year, monthIndex, entries = []) {
  const first = new Date(year, monthIndex, 1);
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayOffset + dayCount) / 7) * 7;
  const byDate = new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry.checkinDate || entry.day, entry]));
  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(year, monthIndex, index - mondayOffset + 1);
    const dateKey = diaryDateKey(date);
    const entry = byDate.get(dateKey) || null;
    return { dateKey, day: date.getDate(), inMonth: date.getMonth() === monthIndex, entry,
      plays: Number(entry?.plays || 0), minutes: Number(entry?.minutes || 0) };
  });
}
