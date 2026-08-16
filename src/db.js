const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

// better-sqlite3 does not create parent directories; ensure they exist first.
fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS records (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL DEFAULT '',
    data             TEXT NOT NULL,
    anonymous_access INTEGER NOT NULL DEFAULT 0,
    created_by       INTEGER,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    prefix       TEXT NOT NULL,
    created_by   INTEGER NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );
`);

// No registration: seed a single initial admin so someone can log in.
function bootstrapAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c === 0) {
    const hash = bcrypt.hashSync(config.ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(config.ADMIN_USERNAME, hash);
    console.log(
      `[bootstrap] No users found. Created initial admin "${config.ADMIN_USERNAME}" ` +
      `with password "${config.ADMIN_PASSWORD}". Log in and change it immediately.`
    );
  }
}
bootstrapAdmin();

module.exports = db;
