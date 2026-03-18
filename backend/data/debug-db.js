// backend/debug-db.js
// Small debug helper to inspect DB contents without PowerShell quoting issues.

const db = require('../database');

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
  node debug-db.js --triggers
  node debug-db.js --test-uuid
  node debug-db.js --scan-uuid

Notes:
  - --sample-xlsx prints one XLSX item and parses metadataJson.
`);
  process.exit(0);
}

const printCounts = () => {
  const total = db.prepare('select count(1) as c from items').get().c;
  const xlsxTotal = db
    .prepare("select count(1) as c from items where json_extract(metadataJson, '$.sourceType') = 'xlsx'")
    .get().c;
  const xlsxWithMeta = db
    .prepare(
      "select count(1) as c from items where json_extract(metadataJson, '$.sourceType') = 'xlsx' and metadataJson is not null and length(metadataJson) > 0"
    )
    .get().c;

  console.log({ totalItems: total, xlsxItems: xlsxTotal, xlsxItemsWithMetadata: xlsxWithMeta });
};

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

const listTriggers = () => {
  const rows = db
    .prepare(
      "select name, tbl_name as tableName, sql from sqlite_master where type='trigger' order by name"
    )
    .all();
  console.log(`Triggers: ${rows.length}`);
  for (const r of rows) {
    console.log(`- ${r.name} (table=${r.tableName})`);
  }
};

const testUuidValidation = () => {
  const invalidId = 'not-a-uuid';
  const validId = '00000000-0000-0000-0000-000000000000';

  const tryInsert = (id) => {
    db.exec('SAVEPOINT uuid_test');
    try {
      db.prepare('INSERT INTO items (id, filename) VALUES (?, ?)').run(id, `uuid_test_${Date.now()}`);
      db.exec('ROLLBACK TO uuid_test');
      db.exec('RELEASE uuid_test');
      return { ok: true };
    } catch (e) {
      try {
        db.exec('ROLLBACK TO uuid_test');
        db.exec('RELEASE uuid_test');
      } catch {
        /* ignore */
      }
      return { ok: false, error: String(e?.message || e) };
    }
  };

  const bad = tryInsert(invalidId);
  const good = tryInsert(validId);

  console.log('UUID validation test:');
  console.log({
    invalidInsertBlocked: !bad.ok,
    invalidInsertError: bad.ok ? null : bad.error,
    validInsertAllowed: good.ok,
    validInsertError: good.ok ? null : good.error,
  });
};

const scanExistingUuid = () => {
  const itemsBad = db
    .prepare(
      "select count(1) as c from items where id is null or id not glob '[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'"
    )
    .get().c;

  const logBad = db
    .prepare(
      "select count(1) as c from classification_log where id is null or id not glob '[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'"
    )
    .get().c;

  const logItemBad = db
    .prepare(
      "select count(1) as c from classification_log where itemId is not null and itemId not glob '[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]-[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'"
    )
    .get().c;

  console.log('UUID scan (existing rows):');
  console.log({
    itemsInvalidIdRows: itemsBad,
    classificationLogInvalidIdRows: logBad,
    classificationLogInvalidItemIdRows: logItemBad,
  });
};

const run = () => {
  const id = getArgValue('--id');

  if (hasFlag('--counts') || args.length === 0) {
    printCounts();
  }

  if (hasFlag('--triggers')) {
    listTriggers();
  }

  if (hasFlag('--test-uuid')) {
    testUuidValidation();
  }

  if (hasFlag('--scan-uuid')) {
    scanExistingUuid();
  }

  if (id) {
    const row = db
      .prepare(
        'select id, metadataJson from items where id = ?'
      )
      .get(id);
    printItem(row);
    return;
  }

  if (hasFlag('--sample-xlsx')) {
    const row = db
      .prepare(
        "select id, metadataJson from items where json_extract(metadataJson, '$.sourceType') = 'xlsx' and metadataJson is not null and length(metadataJson) > 0 order by json_extract(metadataJson, '$.sourceSheet') asc, CAST(json_extract(metadataJson, '$.sourceRow') AS INTEGER) asc limit 1"
      )
      .get();
    printItem(row);
  }
};

run();
