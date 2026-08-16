const express = require('express');
const db = require('../db');
const { hashPassword, requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const users = db
    .prepare('SELECT id, username, created_at FROM users ORDER BY id')
    .all();
  res.json({ users });
});

router.post('/', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password));
  const user = db
    .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
    .get(info.lastInsertRowid);
  return res.status(201).json({ user });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM tokens WHERE created_by = ?').run(id);
  return res.json({ ok: true });
});

module.exports = router;
