const path = require('path');
const express = require('express');
const config = require('./src/config');

// Load DB (creates schema + bootstrap admin) before serving.
require('./src/db');

const app = express();
app.use(express.json({ limit: '100mb' })); // arbitrary payloads, no content validation
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/records', require('./src/routes/records'));
app.use('/api/tokens', require('./src/routes/tokens'));

// Unknown API routes → JSON 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA fallback for all non-API GETs
app.use((req, res, next) => {
  if (req.method === 'GET') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

app.listen(config.PORT, () => {
  console.log(`Data Manager running at http://localhost:${config.PORT}`);
  console.log(`SQLite database: ${config.DB_PATH}`);
});
