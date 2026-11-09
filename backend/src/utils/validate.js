// Small declarative validator. A rule returns [ok, cleanValue | message].
const ApiError = require('./ApiError');

const toNum = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
const rules = {
  int: (min = -Infinity, max = Infinity) => (v) => {
    const n = toNum(v);
    return Number.isInteger(n) && n >= min && n <= max ? [true, n] : [false, `must be a whole number between ${min} and ${max}`];
  },
  num: (min = -Infinity, max = Infinity) => (v) => {
    const n = toNum(v);
    return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? [true, n] : [false, `must be a number between ${min} and ${max}`];
  },
  // a number with at most `places` decimal places, e.g. a percentage 0–100 with 2 decimals
  decimal: (min, max, places = 2) => (v) => {
    const n = toNum(v);
    const scaled = typeof n === 'number' ? n * 10 ** places : NaN;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return [false, `must be a number between ${min} and ${max}`];
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return [false, `may have at most ${places} decimal places`];
    return [true, Math.round(scaled) / 10 ** places];
  },
  str: (min = 0, max = 255, pattern, hint) => (v) => {
    if (typeof v !== 'string') return [false, 'must be text'];
    const s = v.trim();
    if (s.length < min || s.length > max) return [false, `must be ${min}–${max} characters`];
    if (pattern && !pattern.test(s)) return [false, hint || 'has an invalid format'];
    return [true, s];
  },
  email: () => (v) => (typeof v === 'string' && v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
    ? [true, v.trim().toLowerCase()] : [false, 'must be a valid email address']),
  bool: () => (v) => (typeof v === 'boolean' ? [true, v] : v === 'true' || v === 'false' ? [true, v === 'true'] : [false, 'must be true or false']),
  oneOf: (list) => (v) => (list.includes(v) ? [true, v] : [false, `must be one of: ${list.join(', ')}`]),
  hex: () => (v) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? [true, v.toUpperCase()] : [false, 'must be a colour like #A1B2C3']),
  date: () => (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? [true, v] : [false, 'must be a date YYYY-MM-DD']),
  arrayOf: (rule, max = 100, min = 0) => (v) => {
    if (!Array.isArray(v)) return [false, 'must be a list'];
    if (v.length > max || v.length < min) return [false, `must contain ${min}–${max} items`];
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const [ok, val] = rule(v[i]);
      if (!ok) return [false, `item ${i + 1} ${val}`];
      out.push(val);
    }
    return [true, out];
  },
  // nested object validated with its own schema; unknown keys are dropped
  object: (schema) => (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [false, 'must be an object'];
     
    const { clean, errors } = check(schema, v);
    const first = Object.values(errors)[0];
    return first ? [false, `→ ${first}`] : [true, clean];
  },
};

const optional = (rule, fallback) => Object.assign((v) => rule(v), { optional: true, fallback });

function check(schema, input) {
  const errors = {};
  const clean = {};
  for (const [key, rule] of Object.entries(schema)) {
    const v = input ? input[key] : undefined;
    if (v === undefined || v === null || v === '') {
      if (rule.optional) { if (rule.fallback !== undefined) clean[key] = rule.fallback; continue; }
      errors[key] = `${key} is required`;
      continue;
    }
    const [ok, val] = rule(v);
    if (ok) clean[key] = val; else errors[key] = `${key} ${val}`;
  }
  return { clean, errors };
}

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { clean, errors } = check(schema, req[source]);
    if (Object.keys(errors).length) return next(ApiError.badRequest(Object.values(errors)[0], errors));
    req.valid = { ...(req.valid || {}), [source]: clean };
    next();
  };
}

const idParam = (name = 'id') => validate({ [name]: rules.int(1, 2 ** 31) }, 'params');

module.exports = { rules, optional, validate, idParam, check };
