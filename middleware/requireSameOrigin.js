const secrets = require('../config/secrets');

function isAllowedOrigin(req) {
  const origin = req.headers?.origin;
  const requestHost = req.get ? req.get('host') : req.headers?.host;
  if (!origin || origin === 'null' || !requestHost) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === requestHost || (secrets.env === 'development' && origin === 'http://localhost:5173');
  } catch (_) {
    return false;
  }
}

function requireSameOrigin(req, res, next) {
  if (!isAllowedOrigin(req)) return res.status(403).json({ ok: false, error: '请求来源无效，请从本站重新操作' });
  return next();
}

module.exports = { isAllowedOrigin, requireSameOrigin };
