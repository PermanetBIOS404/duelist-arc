const jwt = require('jsonwebtoken');

function signToken({ jwtSecret, user }) {
  return jwt.sign(
    { sub: String(user.id), handle: String(user.handle) },
    jwtSecret,
    { expiresIn: '14d' }
  );
}

function readToken({ cookieName, req }) {
  const fromCookie = req.cookies && req.cookies[cookieName];
  if (fromCookie) return String(fromCookie);
  const auth = String(req.headers.authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

function authMiddleware({ jwtSecret, cookieName }) {
  return (req, res, next) => {
    const token = readToken({ cookieName, req });
    if (!token) return next();
    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = { id: Number(payload.sub), handle: String(payload.handle || '') };
    } catch {
      // ignore bad token
    }
    return next();
  };
}

function requireUser(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

module.exports = { signToken, authMiddleware, requireUser };

