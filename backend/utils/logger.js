const pino = require('pino');

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = pino({
  level,
  base: {
    service: process.env.SERVICE_NAME || 'projectfolio-api',
    environment: process.env.NODE_ENV || 'development',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      'response.headers.set-cookie',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.refresh_token',
      '*.set-cookie',
      '*.cookie',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
});

module.exports = logger;
