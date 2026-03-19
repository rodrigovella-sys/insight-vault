const express = require('express');

const { getVault } = require('./services/getVault');
const { getItem } = require('./services/getItem');
const { getItemFile } = require('./services/getItemFile');
const { confirmItem } = require('./services/confirmItem');
const { reclassifyItem } = require('./services/reclassifyItem');

function createItemsController(ctx) {
  const router = express.Router();

  router.get('/vault', (req, res) => {
    res.json(
      getVault(ctx, {
        pillar: req.query.pillar,
        status: req.query.status,
        search: req.query.search,
      })
    );
  });

  router.get('/items/:id', (req, res) => {
    try {
      res.json(getItem(ctx, { id: req.params.id }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get('/items/:id/file', async (req, res) => {
    try {
      const result = await getItemFile(ctx, { id: req.params.id });
      if (result.kind === 'buffer') {
        res.set('Content-Type', result.mimetype);
        res.set('Content-Disposition', `inline; filename="${result.original}"`);
        return res.send(result.buffer);
      }
      res.set('Content-Type', result.mimetype);
      return res.sendFile(result.path);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.patch('/items/:id/confirm', (req, res) => {
    try {
      res.json(confirmItem(ctx, { id: req.params.id }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.patch('/items/:id/reclassify', (req, res) => {
    try {
      res.json(
        reclassifyItem(ctx, {
          id: req.params.id,
          pillarId: req.body?.pillarId,
          topicId: req.body?.topicId,
        })
      );
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createItemsController };
