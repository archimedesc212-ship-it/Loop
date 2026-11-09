// Express application (exported separately from server.js so tests can import it).
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { corsOrigins, nodeEnv, trustProxy, validateEnvironment } = require('./config/env');
const routes = require('./routes');
const readiness = require('./services/readinessService');
const { externalPreview } = require('./providers');
const { sameOriginOnly } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
// Only trust X-Forwarded-* from the configured number of proxies (0 = none), so
// clients cannot spoof their IP to dodge rate limits.
app.set('trust proxy', trustProxy);

const mediaSrc = ["'self'", 'blob:'];
const previewOrigin = externalPreview.mediaOrigin();
if (previewOrigin) mediaSrc.push(previewOrigin);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', 'https://r2.theaudiodb.com', 'https://www.theaudiodb.com'],
      connectSrc: ["'self'"],
      mediaSrc,
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'same-origin' },
}));
// Cross-origin browser access only for the listed origins (the Vite dev server by
// default). Credentials are allowed for those origins only; same-origin needs no CORS.
app.use('/api', cors({
  origin: (origin, cb) => cb(null, !!origin && corsOrigins.includes(origin)),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Auth-Mode'],
  maxAge: 600,
}));
app.use('/api', sameOriginOnly(corsOrigins));
app.use(express.json({ limit: '100kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Liveness: the process is up. Does not touch the database.
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Do not let a missing cloud database leave the frontend spinning indefinitely.
// Liveness remains available; all database-backed endpoints return a clear 503.
app.use('/api', (req, res, next) => {
  try {
    validateEnvironment();
    return next();
  } catch {
    return res.status(503).json({
      error: {
        code: 'DATABASE_NOT_CONFIGURED',
        message: 'LOOP is deployed, but its MySQL database connection is not configured yet.',
      },
    });
  }
});

// Readiness: database reachable, schema at the expected version, provider states.
app.get('/api/ready', async (req, res, next) => {
  try {
    const r = await readiness.check();
    res.status(r.status === 'ready' ? 200 : 503).json(r);
  } catch (err) { next(err); }
});

app.use('/api', routes);
app.use('/api', notFound);

// Serve the built frontend (npm run build) from the same origin in production.
const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: nodeEnv === 'production' ? '1h' : 0 }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);
module.exports = app;
