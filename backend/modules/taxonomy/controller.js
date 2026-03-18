const express = require('express');
const { getPillars } = require('./services/getPillars');
const { getTopics } = require('./services/getTopics');

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

  return router;
}

module.exports = { createTaxonomyController };
