// backend/server.js — Insight Vault v3.0 — Google Drive Edition
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from local files for development.
// Priority: backend/.env.local -> backend/.env.development -> backend/.env
let loadedEnvPath = null;
for (const envPath of [path.join(__dirname, '.env.local'), path.join(__dirname, '.env.development'), path.join(__dirname, '.env')]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    loadedEnvPath = envPath;
    break;
  }
}

if (loadedEnvPath) {
  console.log(`[Env] loaded ${path.basename(loadedEnvPath)}`);
}
const express = require('express');
const cors = require('cors');

const { createAppContext } = require('./context');
const { createSystemController } = require('./src/system/controller');
const { createTaxonomyController } = require('./src/taxonomy/controller');
const { createItemsController } = require('./src/items/controller');
const { createUploadController } = require('./src/upload/controller');
const { createYoutubeController } = require('./src/youtube/controller');

const app = express();
app.use(express.json());
app.use(cors());

async function main() {
  const ctx = await createAppContext();

  // Endpoints are mounted by domain.
  app.use(createSystemController(ctx));
  app.use(createTaxonomyController(ctx));
  app.use(createItemsController(ctx));
  app.use(createUploadController(ctx));
  app.use(createYoutubeController(ctx));

  // ─────────────────────────────────────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────────────────────────────────────
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Insight Vault v3.0] listening on port ${PORT}`);
    console.log(`[Drive] ${ctx.driveEnabled
      ? '✓ Google Drive storage active'
      : '✗ Local storage active (set GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN + GOOGLE_DRIVE_FOLDER_ID to enable Drive)'
    }`);
    console.log(`[DB] ✓ Postgres active`);
  });
}

main().catch((err) => {
  console.error('[startup] failed:', err);
  process.exit(1);
});
