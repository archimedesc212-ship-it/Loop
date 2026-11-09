export const duration = (sec) => {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '–:––';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const longDuration = (sec) => {
  const m = Math.round((sec || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
};
export const pct = (x, d = 0) => (x === null || x === undefined ? '–' : `${Number(x).toFixed(d)}%`);
export const n = (x) => (x === null || x === undefined ? '–' : Number(x).toLocaleString('en-IN'));
export const score = (x) => (x === null || x === undefined ? '–' : Math.round(Number(x) * 100));
export const hour = (h) => {
  if (h === null || h === undefined) return '–';
  const hh = Number(h);
  return `${((hh + 11) % 12) + 1} ${hh < 12 ? 'AM' : 'PM'}`;
};
// API timestamps are ISO-8601 instants ('…Z'); DATE values are calendar days ('YYYY-MM-DD'),
// which must be read as local midnight (new Date('2026-10-05') would be UTC midnight).
export const toDate = (s) => {
  if (s instanceof Date) return s;
  const str = String(s);
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(str.replace(' ', 'T'));
};
export const date = (s) => {
  if (!s) return '–';
  const d = toDate(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const dateTime = (s) => {
  if (!s) return '–';
  const d = toDate(s);
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
export const ago = (s) => {
  if (!s) return '';
  const d = toDate(s);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};
export const plural = (k, word, many = `${word}s`) => `${n(k)} ${Number(k) === 1 ? word : many}`;
export const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
