const express = require('express');
const db = require('../db');
const { requireAuthOrToken, optionalAuth } = require('../auth');

const router = express.Router();

function rowToJson(row) {
  let data;
  try {
    data = JSON.parse(row.data);
  } catch {
    data = row.data; // fallback: never expect this, but don't crash on bad rows
  }
  return {
    id: row.id,
    name: row.name,
    data,
    anonymous_access: !!row.anonymous_access,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// List: authenticated callers see everything; anonymous callers see only public records.
router.get('/', optionalAuth, (req, res) => {
  const rows = req.user
    ? db.prepare('SELECT * FROM records ORDER BY updated_at DESC, id DESC').all()
    : db
        .prepare('SELECT * FROM records WHERE anonymous_access = 1 ORDER BY updated_at DESC, id DESC')
        .all();
  res.json({ records: rows.map(rowToJson) });
});

router.get('/:id', optionalAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Record not found' });
  if (!row.anonymous_access && !req.user) {
    return res.status(401).json({ error: 'Authentication required for this record' });
  }
  res.json({ record: rowToJson(row) });
});

router.post('/', requireAuthOrToken, (req, res) => {
  const body = req.body || {};
  if (typeof body.data === 'undefined') {
    return res.status(400).json({ error: 'data is required' });
  }
  const name = typeof body.name === 'string' ? body.name : '';
  const anonymousAccess = body.anonymous_access ? 1 : 0;
  const info = db
    .prepare(
      'INSERT INTO records (name, data, anonymous_access, created_by) VALUES (?, ?, ?, ?)'
    )
    .run(name, JSON.stringify(body.data), anonymousAccess, req.user.id);
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ record: rowToJson(row) });
});

router.put('/:id', requireAuthOrToken, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name : existing.name;
  const data = typeof body.data === 'undefined' ? existing.data : JSON.stringify(body.data);
  const anonymousAccess =
    typeof body.anonymous_access === 'undefined'
      ? existing.anonymous_access
      : body.anonymous_access
        ? 1
        : 0;

  db.prepare(
    "UPDATE records SET name = ?, data = ?, anonymous_access = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, data, anonymousAccess, id);
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  res.json({ record: rowToJson(row) });
});

router.delete('/:id', requireAuthOrToken, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM records WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Record not found' });
  db.prepare('DELETE FROM records WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
