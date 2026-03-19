const express = require('express');
const { getHealth } = require('./services/getHealth');

function createSystemController(ctx) {
  const router = express.Router();

  router.get('/health', async (_, res) => {
    try {
      res.json(await getHealth(ctx));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createSystemController };
