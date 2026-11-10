/* global module, require, URL */
// Stable Vercel Function entrypoint for all /api/* traffic.
// vercel.json forwards the original API suffix in __loop_path; restore the
// exact Express URL before handing the request to the existing application.
const app = require('../backend/src/app');

module.exports = function loopApi(req, res) {
  const original = new URL(req.url || '/', 'http://vercel.internal');
  const suffix = original.searchParams.get('__loop_path');

  if (!suffix || suffix.includes('..') || suffix.startsWith('/')) {
    return res.status(400).json({
      error: { code: 'INVALID_API_PATH', message: 'Invalid API route.' },
    });
  }

  original.searchParams.delete('__loop_path');
  req.url = `/api/${suffix}${original.search}`;
  return app(req, res);
};
