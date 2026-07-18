require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { RedisStore: SessionRedisStore } = require('connect-redis');
const { RedisStore: RateLimitRedisStore } = require('rate-limit-redis');
const pinoHttp = require('pino-http');
const passport = require('./config/passport');
const jwt = require('jsonwebtoken');
const { query, closePool } = require('./config/database');
const { getRedis, connectRedis, closeRedis, redisEnabled } = require('./config/redis');
const { register, httpDuration } = require('./config/metrics');
const { closeQueue } = require('./jobs/service');
const { getSandboxOrigin } = require('./config/customSite');
const logger = require('./utils/logger');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(pinoHttp({ logger }));
// Allow the app page to frame the custom-site sandbox origin; default-src 'self'
// would otherwise block the cross-origin iframe. Only frame-src is overridden.
const customSiteSandboxOrigin = getSandboxOrigin();
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'frame-src': ["'self'", ...(customSiteSandboxOrigin ? [customSiteSandboxOrigin] : [])],
    },
  },
}));
app.use(compression());
app.use(cookieParser());

const redis = getRedis();
const rateStore = (prefix) => redis ? new RateLimitRedisStore({
  sendCommand: (...args) => redis.call(...args),
  prefix,
}) : undefined;

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Math.max(100, Number(process.env.API_RATE_LIMIT) || 1000),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: rateStore('rl:api:'),
  message: { error: 'Too many requests. Please try again shortly.' },
}));
app.use('/api', (req, res, next) => req.path.includes('legacy-disabled')
  ? res.status(404).json({ error: 'Route not found.' })
  : next());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Math.max(10, Number(process.env.AUTH_RATE_LIMIT) || 100),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: rateStore('rl:auth:'),
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

const normalizeIpForRateLimit = (ip = 'unknown') => {
  const normalized = ip.replace(/^::ffff:/, '');
  if (!normalized.includes(':')) return normalized;
  return normalized.split(':').slice(0, 4).join(':') || normalized;
};
const pollingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        if (decoded?.userId) return `user:${decoded.userId}`;
      } catch {}
    }
    return `ip:${normalizeIpForRateLimit(req.ip)}`;
  },
  skip: (req) => req.method !== 'GET',
  store: rateStore('rl:poll:'),
  message: { error: 'Too many notification refreshes. Please wait a moment.' },
});
app.use('/api/notifications', pollingLimiter);

const allowedOrigins = new Set([
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
]);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));

app.use(session({
  store: redis ? new SessionRedisStore({ client: redis, prefix: 'session:' }) : undefined,
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  name: 'pf_session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  },
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.FORM_BODY_LIMIT || '1mb' }));
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
    httpDuration.observe({ method: req.method, route, status: String(res.statusCode) }, Number(process.hrtime.bigint() - started) / 1e9);
  });
  next();
});

app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
app.get('/health', (req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: require('./package.json').version,
  environment: process.env.NODE_ENV || 'development',
}));
app.get('/health/ready', async (req, res) => {
  try {
    const schema = await query({
      name: 'health-ready',
      text: `SELECT
        (SELECT COUNT(*)::int FROM schema_migrations) AS migration_count,
        (SELECT COUNT(*)::int FROM schema_migration_warnings) AS warning_count`,
    });
    if (redisEnabled) await redis.ping();
    const warningCount = schema.rows[0].warning_count;
    const warningsFatal = process.env.MIGRATION_WARNINGS_FATAL === 'true';
    if (warningCount > 0 && warningsFatal) {
      return res.status(503).json({ status: 'not_ready', database: 'degraded', migration_warnings: warningCount });
    }
    res.json({
      status: warningCount ? 'ready_with_warnings' : 'ready',
      database: 'ok', redis: redisEnabled ? 'ok' : 'disabled',
      migrations: schema.rows[0].migration_count, migration_warnings: warningCount,
    });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});
app.get('/metrics', async (req, res) => {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return res.status(404).end();
  if (req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/auth', require('./routes/oauth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/media', require('./routes/media'));
app.use('/api/export', require('./routes/export'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/collaborators', require('./routes/collaborators'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/discover', require('./routes/discover'));
app.use('/api/endorsements', require('./routes/endorsements'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/advisor', require('./routes/advisor'));
app.use('/api/import', require('./routes/import'));

app.use('/api/*', (req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` }));
app.use((err, req, res, next) => {
  req.log?.error({ err }, 'Unhandled request error');
  if (res.headersSent) return next(err);
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ error: 'Origin not allowed.' });
  return res.status(500).json({ error: 'Internal server error. Please try again.' });
});

const startServer = async () => {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || !process.env.SESSION_SECRET || process.env.JWT_SECRET === process.env.SESSION_SECRET) {
      throw new Error('Production requires distinct JWT_SECRET and SESSION_SECRET values.');
    }
    if (!process.env.METRICS_TOKEN) throw new Error('Production requires METRICS_TOKEN.');
  }
  if (process.env.NODE_ENV === 'production' && !redisEnabled) {
    throw new Error('REDIS_URL is required in production for shared sessions, rate limits, cache, and jobs.');
  }
  if (redisEnabled) await connectRedis();
  const server = app.listen(PORT, () => logger.info({ port: PORT }, 'ProjectFolio API server listening'));
  server.on('error', (error) => logger.fatal({ err: error }, 'Server failed'));

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Graceful shutdown started');
    server.close(async () => {
      await Promise.allSettled([closeQueue(), closeRedis(), closePool()]);
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return server;
};

if (require.main === module) startServer().catch((error) => {
  logger.fatal({ err: error }, 'Server startup failed');
  process.exitCode = 1;
});

module.exports = app;
module.exports.startServer = startServer;
