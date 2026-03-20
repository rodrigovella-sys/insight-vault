const express = require('express');

const { getVault } = require('./services/getVault');
const { getItem } = require('./services/getItem');
const { getItemFile } = require('./services/getItemFile');
const { confirmItem } = require('./services/confirmItem');
const { reclassifyItem } = require('./services/reclassifyItem');

function createItemsController(ctx) {
  const router = express.Router();

  router.get('/vault', async (req, res) => {
    try {
      const q = req.query || {};

      const paginationRequested =
        Object.prototype.hasOwnProperty.call(q, 'limit') ||
        Object.prototype.hasOwnProperty.call(q, 'offset') ||
        Object.prototype.hasOwnProperty.call(q, 'page') ||
        Object.prototype.hasOwnProperty.call(q, 'pageSize');

      const parseIntSafe = (v, fallback) => {
        const n = Number.parseInt(String(v ?? ''), 10);
        return Number.isFinite(n) ? n : fallback;
      };

      const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

      const limit = clamp(parseIntSafe(q.limit ?? q.pageSize, 20), 1, 200);
      let offset = clamp(parseIntSafe(q.offset, 0), 0, Number.MAX_SAFE_INTEGER);

      const page = parseIntSafe(q.page, null);
      if (page !== null) {
        offset = Math.max(0, (Math.max(1, page) - 1) * limit);
      }

      res.json(
        await getVault(ctx, {
          pillar: q.pillar,
          topicId: q.topicId,
          status: q.status,
          search: q.search,
          limit: paginationRequested ? limit : undefined,
          offset: paginationRequested ? offset : undefined,
        })
      );
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get('/items/:id', async (req, res) => {
    try {
      res.json(await getItem(ctx, { id: req.params.id }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get('/items/:id/file', async (req, res) => {
    try {
      const resolve = String(req.query.resolve || '') === '1';
      const result = await getItemFile(ctx, { id: req.params.id, resolve });

      if (resolve) {
        if (result.kind === 'url' && result.url) return res.json({ url: result.url });
        return res.status(404).json({ error: 'File not found' });
      }

      if (result.kind === 'redirect') {
        return res.redirect(result.url);
      }
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

  router.patch('/items/:id/confirm', async (req, res) => {
    try {
      res.json(await confirmItem(ctx, { id: req.params.id }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.patch('/items/:id/reclassify', async (req, res) => {
    try {
      res.json(
        await reclassifyItem(ctx, {
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
