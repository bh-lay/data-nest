const express = require('express');
const db = require('../db');
const { generateApiToken, requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const tokens = db
    .prepare(
      'SELECT id, name, prefix, created_at, last_used_at FROM tokens ORDER BY id'
    )
    .all();
  res.json({ tokens });
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const token = generateApiToken();
  const info = db
    .prepare('INSERT INTO tokens (name, token_hash, prefix, created_by) VALUES (?, ?, ?, ?)')
    .run(name, token.hash, token.prefix, req.user.id);
  // The raw token is returned exactly once; only its hash is stored.
  res.status(201).json({
    token: {
      id: info.lastInsertRowid,
      name,
      prefix: token.prefix,
      created_at: db
        .prepare('SELECT created_at FROM tokens WHERE id = ?')
        .get(info.lastInsertRowid).created_at,
      last_used_at: null,
    },
    secret: token.raw,
  });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM tokens WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Token not found' });
  db.prepare('DELETE FROM tokens WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
