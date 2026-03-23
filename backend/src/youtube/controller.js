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
      const { playlistId, items } = await listYoutubePlaylistItems(ctx, { url: req.body?.url });

      const videoIds = items
        .map((it) => it?.snippet?.resourceId?.videoId)
        .filter(Boolean);

      // Backward-compatible dedup: older rows always have filename = yt_<videoId>.
      let alreadyImported = 0;
      let skipVideoIds = [];
      if (videoIds.length) {
        try {
          const filenames = videoIds.map((v) => `yt_${v}`);
          const rows = await ctx.db
            .prepare('SELECT filename FROM items WHERE filename = ANY(?)')
            .all(filenames);
          const existing = new Set((rows || []).map((r) => r.filename));
          skipVideoIds = videoIds.filter((v) => existing.has(`yt_${v}`));
          alreadyImported = skipVideoIds.length;
        } catch (e) {
          // If the query fails for any reason, keep prior behavior (process all).
          alreadyImported = 0;
          skipVideoIds = [];
        }
      }

      const result = await processYoutubePlaylistItems(ctx, { items, playlistId, skipVideoIds });

      res.json({
        playlistId,
        total: items.length,
        alreadyImported,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
      });
    } catch (err) {
      console.error('[playlist] error:', err);
      res.status(err.status || 500).json({ error: 'Playlist failed', details: err.message });
    }
  });

  return router;
}

module.exports = { createYoutubeController };
