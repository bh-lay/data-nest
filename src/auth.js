const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const SECRET = config.getJwtSecret();
const TOKEN_PREFIX_LEN = 8;

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function signSession(user) {
  return jwt.sign({ sub: user.id, username: user.username }, SECRET, {
    expiresIn: config.SESSION_TTL,
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateApiToken() {
  const raw = `dm_${crypto.randomBytes(24).toString('hex')}`;
  return { raw, hash: sha256(raw), prefix: raw.slice(0, TOKEN_PREFIX_LEN + 3) };
}

function userBySessionPayload(payload) {
  if (!payload || !payload.sub) return null;
  return db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(payload.sub);
}

function userByApiToken(rawToken) {
  if (!rawToken) return null;
  const row = db
    .prepare('SELECT * FROM tokens WHERE token_hash = ?')
    .get(sha256(rawToken));
  if (!row) return null;
  db.prepare("UPDATE tokens SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
  return db
    .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
    .get(row.created_by);
}

function readBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

// Session (JWT) only.
function requireAuth(req, res, next) {
  const bearer = readBearer(req);
  if (!bearer) return res.status(401).json({ error: 'Authentication required' });
  try {
    const user = userBySessionPayload(jwt.verify(bearer, SECRET));
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    req.user = user;
    req.authType = 'session';
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

// Session (JWT) or API token. Used for data-modifying endpoints.
function requireAuthOrToken(req, res, next) {
  const apiToken = req.headers['x-api-token'];
  if (apiToken) {
    const user = userByApiToken(apiToken);
    if (user) {
      req.user = user;
      req.authType = 'token';
      return next();
    }
    return res.status(401).json({ error: 'Invalid API token' });
  }

  const bearer = readBearer(req);
  if (bearer) {
    try {
      const user = userBySessionPayload(jwt.verify(bearer, SECRET));
      if (user) {
        req.user = user;
        req.authType = 'session';
        return next();
      }
    } catch {
      // fall through to API-token attempt
    }
    const user = userByApiToken(bearer);
    if (user) {
      req.user = user;
      req.authType = 'token';
      return next();
    }
    return res.status(401).json({ error: 'Invalid session or API token' });
  }

  return res.status(401).json({ error: 'Authentication required' });
}

// Identify the caller if possible, but never reject. Used for anonymous reads.
function optionalAuth(req, res, next) {
  req.user = null;
  req.authType = 'anonymous';

  const apiToken = req.headers['x-api-token'];
  if (apiToken) {
    const user = userByApiToken(apiToken);
    if (user) {
      req.user = user;
      req.authType = 'token';
    }
    return next();
  }

  const bearer = readBearer(req);
  if (bearer) {
    try {
      const user = userBySessionPayload(jwt.verify(bearer, SECRET));
      if (user) {
        req.user = user;
        req.authType = 'session';
      }
    } catch {
      const user = userByApiToken(bearer);
      if (user) {
        req.user = user;
        req.authType = 'token';
      }
    }
  }
  return next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signSession,
  generateApiToken,
  requireAuth,
  requireAuthOrToken,
  optionalAuth,
};
