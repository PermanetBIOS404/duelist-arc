const path = require('node:path');

const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const express = require('express');

const { authMiddleware } = require('./auth');
const { openDb, migrate } = require('./db');
const { authRoutes } = require('./routes/auth');
const { cardImagesRoutes } = require('./routes/card-images');
const { cardsRoutes } = require('./routes/cards');
const { decksRoutes } = require('./routes/decks');
const { matchesRoutes } = require('./routes/matches');
const { tournamentsRoutes } = require('./routes/tournaments');
const { duelCoreRoutes } = require('./routes/duel-core');
const { cpuDuelEdoproRoutes } = require('./routes/cpu-duel-edopro');
const { duelLocalRoutes } = require('./routes/duel-local');
const { duelSessionRoutes } = require('./routes/duel-session');
const { duelServiceRoutes } = require('./routes/duel-service');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = Number(process.env.PORT || 8787);
const HOST = String(process.env.HOST || (String(process.env.NODE_ENV || 'development') === 'production' ? '0.0.0.0' : '127.0.0.1'));
const DB_PATH = String(process.env.DB_PATH || './data/app.db');
const NODE_ENV = String(process.env.NODE_ENV || 'development');
const JWT_SECRET = String(process.env.JWT_SECRET || 'dev-secret');
const COOKIE_NAME = String(process.env.COOKIE_NAME || 'ygo_token');
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';
// If you deploy a short-lived public demo, set PUBLIC_INDEXING=false (recommended).
// Default: true (preserves prior behavior of serving robots/sitemap normally).
const PUBLIC_INDEXING = String(process.env.PUBLIC_INDEXING || 'true').toLowerCase() === 'true';
const DUEL_LOCAL_ENABLED = String(process.env.DUEL_LOCAL_ENABLED || '').toLowerCase() === 'true';
const ENABLE_DUEL_LOCAL = DUEL_LOCAL_ENABLED || NODE_ENV !== 'production';

const db = openDb({ dbPath: DB_PATH });
migrate(db);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(authMiddleware({ jwtSecret: JWT_SECRET, cookieName: COOKIE_NAME }));

// Basic hardening headers (avoid breaking the static app; keep CSP permissive for now).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  if (NODE_ENV === 'production' && !PUBLIC_INDEXING) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
  }
  return next();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  if (NODE_ENV === 'production' && !PUBLIC_INDEXING) {
    return res.send('User-agent: *\nDisallow: /\n');
  }
  return res.send('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n');
});

app.get('/sitemap.xml', (req, res) => {
  if (NODE_ENV === 'production' && !PUBLIC_INDEXING) {
    return res.status(404).type('application/xml').send('');
  }
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = ['/', '/?demo=1&view=demo', '/?demo=1&view=duel'].map((p) => `${base}${p}`);
  res.type('application/xml');
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((loc) => `  <url><loc>${loc.replaceAll('&', '&amp;')}</loc></url>\n`).join('') +
      `</urlset>\n`,
  );
});

app.use('/auth', authRoutes({ db, jwtSecret: JWT_SECRET, cookieName: COOKIE_NAME, cookieSecure: COOKIE_SECURE }));
app.get('/me', (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: 'unauthorized' });
  return res.json({ user: { id: req.user.id, handle: req.user.handle } });
});
app.use('/decks', decksRoutes({ db }));
app.use('/matches', matchesRoutes({ db }));
app.use('/tournaments', tournamentsRoutes({ db }));
app.use('/duel-core', duelCoreRoutes());
app.use('/cpu-duel/edopro', cpuDuelEdoproRoutes());
if (ENABLE_DUEL_LOCAL) {
  app.use('/duel/local', duelLocalRoutes());
}
app.use('/duel/session', duelSessionRoutes());
app.use('/duel/service', duelServiceRoutes());
app.use('/cards', cardsRoutes({ dataDir: path.join(__dirname, '..', 'data') }));
app.use(
  '/card-images',
  cardImagesRoutes({
    dataDir: path.join(__dirname, '..', 'data'),
    remoteTemplate: String(process.env.YGOPRODECK_IMAGE_TEMPLATE || 'https://images.ygoprodeck.com/images/cards/{id}.jpg'),
  })
);

// Serve the existing vanilla frontend as static files (production-friendly).
const frontendDir = path.join(__dirname, '..', '..', 'src');
app.use(
  '/',
  express.static(frontendDir, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      // Cache-bust via querystring on css/js; safe to cache for a while.
      if (/\.(css|js|png|jpg|jpeg|gif|svg|webp)$/i.test(String(filePath || ''))) {
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// Friendly HTML 404 for demo deployments.
app.use((req, res) => {
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html')) {
    return res.status(404).sendFile(path.join(frontendDir, '404.html'));
  }
  return res.status(404).json({ ok: false, error: 'not_found' });
});

const server = app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

server.on('error', (err) => {
  const code = String(err && err.code ? err.code : '');
  const msg = String(err && err.message ? err.message : err);
  // eslint-disable-next-line no-console
  console.error(`[server] failed to listen on ${HOST}:${PORT} (${code || 'error'}): ${msg}`);
  if (code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error('[server] Hint: another process is already using this port. Set PORT to a free port or stop the other service.');
  } else if (code === 'EACCES' || code === 'EPERM') {
    // eslint-disable-next-line no-console
    console.error('[server] Hint: permission denied for this port/host. Try a different PORT or run in an environment that allows listening.');
  }
  process.exit(1);
});
