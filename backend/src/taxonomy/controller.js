const express = require('express');
const { getPillars } = require('./services/getPillars');
const { getTopics } = require('./services/getTopics');
const { createTopic } = require('./services/createTopic');

function createTaxonomyController(ctx) {
  const router = express.Router();

  router.get('/pillars', (_, res) => {
    res.json(getPillars(ctx));
  });

  router.get('/topics', (req, res) => {
    try {
      res.json(getTopics(ctx, { pillarId: req.query.pillar }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/topics', (req, res) => {
    try {
      const topic = createTopic(ctx, {
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
