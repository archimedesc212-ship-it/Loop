// Vercel Node Function entrypoint for the existing Express API.
// Vercel routes /api/* requests here; Express keeps the original route paths,
// session cookies, CSRF checks, validation, and permission middleware.
module.exports = require('../backend/src/app');
