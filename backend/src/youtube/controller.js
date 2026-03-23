const express = require('express');

const { createYoutubeItem } = require('./services/createYoutubeItem');
const { listYoutubePlaylistItems } = require('./services/listYoutubePlaylistItems');
const { processYoutubePlaylistItems } = require('./services/processYoutubePlaylistItems');

function createYoutubeController(ctx) {
  const router = express.Router();

  router.post('/youtube', async (req, res) => {
    try {
      const item = await createYoutubeItem(ctx, { url: req.body?.url });
      res.status(201).json(item);
    } catch (err) {
      console.error('[youtube] error:', err);
      res.status(err.status || 500).json({ error: 'YouTube classification failed', details: err.message });
    }
  });

  router.post('/youtube/playlist', async (req, res) => {
    try {
      const { items } = await listYoutubePlaylistItems(ctx, { url: req.body?.url });
      res.json({ message: `Processing ${items.length} videos...`, total: items.length });

      (async () => {
        try {
          await processYoutubePlaylistItems(ctx, { items });
        } catch (err) {
          console.error('[playlist] background error:', err);
        }
      })();
    } catch (err) {
      console.error('[playlist] error:', err);
      res.status(err.status || 500).json({ error: 'Playlist failed', details: err.message });
    }
  });

  return router;
}

module.exports = { createYoutubeController };
