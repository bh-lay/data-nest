const express = require('express');
const db = require('../db');
const {
  verifyPassword,
  hashPassword,
  signSession,
  requireAuth,
} = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = db
    .prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ?')
    .get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = signSession(user);
  return res.json({
    token,
    user: { id: user.id, username: user.username, created_at: user.created_at },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'new_password must be at least 6 characters' });
  }
  const user = db
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .get(req.user.id);
  if (!verifyPassword(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hashPassword(new_password),
    req.user.id
  );
  return res.json({ ok: true });
});

module.exports = router;
