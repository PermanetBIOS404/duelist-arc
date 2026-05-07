function defaultKey(req) {
  const uid = req.user && req.user.id ? Number(req.user.id) : 0;
  if (uid) return `u:${uid}`;
  return `ip:${String(req.ip || '').trim() || 'unknown'}`;
}

function rateLimit({ windowMs = 60_000, max = 60, keyFn } = {}) {
  const buckets = new Map(); // key -> { start, count }

  return (req, res, next) => {
    const now = Date.now();
    const key = typeof keyFn === 'function' ? String(keyFn(req) || '') : defaultKey(req);
    const k = key || 'unknown';
    const prev = buckets.get(k) || { start: now, count: 0 };
    const age = now - Number(prev.start || 0);
    if (age < 0 || age >= windowMs) {
      prev.start = now;
      prev.count = 0;
    }
    prev.count += 1;
    buckets.set(k, prev);

    if (prev.count > max) {
      const retryAfterMs = Math.max(0, windowMs - (now - prev.start));
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({ ok: false, error: 'rate_limited', retryAfterMs });
    }

    return next();
  };
}

module.exports = { rateLimit };

