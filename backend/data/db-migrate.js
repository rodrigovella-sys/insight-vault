// Runs Postgres migrations + taxonomy seed without starting the HTTP server.
// Loads env vars using same precedence as server.js.

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const postgres = require('../dbpostgres');

// Load environment variables from local files for development.
// Priority: backend/.env.local -> backend/.env.development -> backend/.env
let loadedEnvPath = null;
for (const envPath of [
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env.development'),
  path.join(__dirname, '..', '.env'),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    loadedEnvPath = envPath;
    break;
  }
}

if (loadedEnvPath) {
  console.log(`[Env] loaded ${path.basename(loadedEnvPath)}`);
}

async function main() {
  const ok = await postgres.init({ migrate: true });
  if (!ok) {
    console.error('[db:migrate] Postgres is not configured (missing DATABASE_URL)');
    process.exitCode = 1;
    return;
  }

  console.log('[db:migrate] migrations complete');

  try {
    await postgres.close();
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error('[db:migrate] failed:', err);
  process.exit(1);
});
