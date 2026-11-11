// Validation and formatting for mood-match percentages (0–100, at most two decimals).
// The same rules are enforced again by the API (validate.js `decimal`) and by a CHECK
// constraint in MySQL; this copy only gives instant feedback in the form.

export const PCT_MIN = 0;
export const PCT_MAX = 100;

/** validatePct('92.5') -> { ok: true, value: 92.5 } | { ok: false, error: '…' } */
export function validatePct(raw) {
  const text = typeof raw === 'number' ? String(raw) : String(raw ?? '').trim();
  if (text === '') return { ok: false, error: 'Enter a percentage from 0 to 100.' };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Use a number, e.g. 72.5.' };
  const n = Number(text);
  if (n < PCT_MIN || n > PCT_MAX) return { ok: false, error: 'Must be between 0 and 100.' };
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return { ok: false, error: 'At most two decimal places.' };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** 92.5 -> '92.50%'; null/undefined -> '—' (no data is never shown as 0 %). */
export const formatPct = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : `${Number(n).toFixed(2)}%`);

/** AI confidence is stored 0–1; shown as a whole percentage with its own label. */
export const formatAi = (c) => (c === null || c === undefined ? '—' : `${Math.round(Number(c) * 100)}%`);

export const ratingCount = (n) => (n === 1 ? '1 rating' : `${n || 0} ratings`);
