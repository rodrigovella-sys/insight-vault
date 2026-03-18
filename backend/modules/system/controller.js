const express = require('express');
const { getHealth } = require('./services/getHealth');

function createSystemController(ctx) {
  const router = express.Router();

  router.get('/health', (_, res) => {
    res.json(getHealth(ctx));
  });

  return router;
}

module.exports = { createSystemController };
