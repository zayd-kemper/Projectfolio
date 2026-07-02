const express = require('express');
const crypto = require('crypto');
const passport = require('../config/passport');
const { issueAuthTokens } = require('../utils/tokens');
const { getRedis } = require('../config/redis');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
require('dotenv').config();

const router = express.Router();
const localExchangeCodes = new Map();
const exchangeTtlSeconds = 60;
const exchangeSchema = {
  code: s.string({ required: true, min: 20, max: 128, pattern: /^[a-zA-Z0-9_-]+$/ }),
};

const storeOAuthExchange = async (payload) => {
  const code = crypto.randomBytes(32).toString('base64url');
  const key = `oauth:exchange:${code}`;
  const redis = getRedis();
  if (redis) {
    await redis.set(key, JSON.stringify(payload), 'EX', exchangeTtlSeconds);
  } else {
    localExchangeCodes.set(code, { payload, expiresAt: Date.now() + exchangeTtlSeconds * 1000 });
  }
  return code;
};

const consumeOAuthExchange = async (code) => {
  if (!code || typeof code !== 'string') return null;
  const key = `oauth:exchange:${code}`;
  const redis = getRedis();
  if (redis) {
    const payload = await redis.get(key);
    if (!payload) return null;
    await redis.del(key);
    return JSON.parse(payload);
  }
  const entry = localExchangeCodes.get(code);
  localExchangeCodes.delete(code);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.payload;
};

// After OAuth success, redirect with a short one-time code instead of a bearer token.
const handleOAuthSuccess = async (req, res, next) => {
  try {
    const token = await issueAuthTokens(res, req.user);
    const user = {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.full_name,
      username: req.user.username,
      avatar_url: req.user.avatar_url,
    };
    const code = await storeOAuthExchange({ token, user });
    res.redirect(`${process.env.FRONTEND_URL}/oauth-success?code=${encodeURIComponent(code)}`);
  } catch (error) {
    next(error);
  }
};

router.post('/oauth/exchange', validateSchema({ body: exchangeSchema }), userQuota('oauth.exchange', { windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  try {
    const payload = await consumeOAuthExchange(req.body?.code);
    if (!payload) return res.status(400).json({ error: 'OAuth exchange expired.', code: 'OAUTH_EXCHANGE_EXPIRED' });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: 'OAuth exchange failed.' });
  }
});

// ── GOOGLE ────────────────────────────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed` }),
  handleOAuthSuccess
);

// ── LINKEDIN ──────────────────────────────────────────────────────────────────
router.get('/linkedin', passport.authenticate('linkedin', {
  scope: ['openid', 'profile', 'email']
}));

router.get('/linkedin/callback',
  passport.authenticate('linkedin', {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=linkedin_failed`
  }),
  handleOAuthSuccess
);

module.exports = router;
