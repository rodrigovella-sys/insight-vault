// backend/data/debug-db.js
// Small debug helper to inspect Postgres DB contents without PowerShell quoting issues.

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from local files for development.
// Priority: backend/.env.local -> backend/.env.development -> backend/.env
for (const envPath of [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env.development'), path.join(__dirname, '..', '.env')]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

const postgres = require('../dbpostgres');

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`Usage:
  node debug-db.js --counts
  node debug-db.js --sample-xlsx
  node debug-db.js --id <itemId>

Notes:
  - --sample-xlsx prints one XLSX item and parses metadataJson.
`);
  process.exit(0);
}

async function printCounts(db) {
  const total = (await db.prepare('select count(1) as c from items').get())?.c || 0;
  const xlsxTotal =
    (await db
      .prepare(
        "select count(1) as c from items where metadataJson is not null and metadataJson <> '' and (metadataJson::jsonb->>'sourceType') = 'xlsx'"
      )
      .get())?.c || 0;
  const xlsxWithMeta =
    (await db
      .prepare(
        "select count(1) as c from items where metadataJson is not null and char_length(metadataJson) > 0 and (metadataJson::jsonb->>'sourceType') = 'xlsx'"
      )
      .get())?.c || 0;

  console.log({ totalItems: total, xlsxItems: xlsxTotal, xlsxItemsWithMetadata: xlsxWithMeta });
}

const printItem = (row) => {
  if (!row) {
    console.log('No item found.');
    return;
  }

  const base = {
    id: row.id,
    metadataJsonLength: row.metadataJson ? row.metadataJson.length : 0,
  };

  if (!row.metadataJson) {
    console.log('Item:', base);
    console.log('metadataJson is NULL/empty for this item.');
    return;
  }

  try {
    const parsed = JSON.parse(row.metadataJson);
    const topKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    const dataKeys = parsed?.data && typeof parsed.data === 'object' ? Object.keys(parsed.data) : [];

    console.log('Item:', {
      ...base,
      sourceType: parsed?.sourceType ?? null,
      sourceFile: parsed?.sourceFile ?? null,
      sourceSheet: parsed?.sourceSheet ?? null,
      sourceRow: parsed?.sourceRow ?? null,
    });
    console.log('metadataJson keys:', topKeys);
    console.log('metadataJson.data keys (first 25):', dataKeys.slice(0, 25));

    const sample = {
      videoTitle: parsed?.data?.videoTitle ?? null,
      youtubeUrl: parsed?.data?.youtubeUrl ?? null,
      keyQuote: parsed?.data?.keyQuote ?? null,
      macroPillar: parsed?.data?.macroPillar ?? null,
      subcategory: parsed?.data?.subcategory ?? null,
      originalSubtheme: parsed?.data?.originalSubtheme ?? null,
    };

    console.log('metadataJson.data sample:', sample);
  } catch (err) {
    console.log('Failed to JSON.parse(metadataJson):', String(err?.message || err));
    console.log('metadataJson preview:', row.metadataJson.slice(0, 200));
  }
};

async function run() {
  await postgres.init();
  const db = postgres.db;

  const id = getArgValue('--id');

  if (hasFlag('--counts') || args.length === 0) {
    await printCounts(db);
  }

  if (id) {
    const row = await db.prepare('select id, metadataJson from items where id = ?').get(id);
    printItem(row);
    return;
  }

  if (hasFlag('--sample-xlsx')) {
    const row = await db
      .prepare(
        "select id, metadataJson from items where metadataJson is not null and metadataJson <> '' and (metadataJson::jsonb->>'sourceType') = 'xlsx' order by (metadataJson::jsonb->>'sourceSheet') asc, CAST(metadataJson::jsonb->>'sourceRow' AS INTEGER) asc limit 1"
      )
      .get();
    printItem(row);
  }
}

run().catch((err) => {
  console.error('[debug-db] failed:', err);
  process.exit(1);
});
