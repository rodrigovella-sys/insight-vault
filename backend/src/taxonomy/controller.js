const express = require('express');
const { getPillars } = require('./services/getPillars');
const { getTopics } = require('./services/getTopics');
const { createTopic } = require('./services/createTopic');

function createTaxonomyController(ctx) {
  const router = express.Router();

  router.get('/pillars', async (_, res) => {
    try {
      res.json(await getPillars(ctx));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get('/topics', async (req, res) => {
    try {
      res.json(await getTopics(ctx, { pillarId: req.query.pillar }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/topics', async (req, res) => {
    try {
      const topic = await createTopic(ctx, {
        pillarId: req.body?.pillarId,
        name: req.body?.name,
      });
      res.status(201).json(topic);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createTaxonomyController };
