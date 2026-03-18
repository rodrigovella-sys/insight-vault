const express = require('express');

const { backupDatabase } = require('./services/backupDatabase');
const { restoreDatabase } = require('./services/restoreDatabase');
const { recoverDatabase } = require('./services/recoverDatabase');

function createDatabaseController(ctx) {
  const router = express.Router();

  router.post('/database/backup', (req, res) => {
    try {
      const result = backupDatabase(ctx);
      res.status(201).json(result);
    } catch (err) {
      console.error('[database][backup] error:', err);
      res.status(err.status || 500).json({ error: 'Backup failed', details: err.message });
    }
  });

  router.post('/database/restore', (req, res) => {
    try {
      const result = restoreDatabase(ctx, { fileName: req.body?.fileName });
      res.json(result);
    } catch (err) {
      console.error('[database][restore] error:', err);
      res.status(err.status || 500).json({ error: 'Restore failed', details: err.message });
    }
  });

  router.post('/database/recover', (req, res) => {
    try {
      const result = recoverDatabase(ctx, { fileName: req.body?.fileName });
      res.json(result);
    } catch (err) {
      console.error('[database][recover] error:', err);
      res.status(err.status || 500).json({ error: 'Recover failed', details: err.message });
    }
  });

  return router;
}

module.exports = { createDatabaseController };
