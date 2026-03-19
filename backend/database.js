// backend/database.js — Insight Vault
const path = require('path');
const Database = require('better-sqlite3');
const { PILLARS } = require('./taxonomy');

const uuidHexGlob = () => {
  const hex = '[0-9A-Fa-f]';
  const rep = (n) => Array.from({ length: n }, () => hex).join('');
  return `${rep(8)}-${rep(4)}-${rep(4)}-${rep(4)}-${rep(12)}`;
};

const UUID_GLOB = uuidHexGlob();

const db = new Database(path.join(__dirname, 'vault.db'));

// Recommended PRAGMAs for reliability (explicitly set to avoid surprises).
// Note: We keep rollback-journal mode (DELETE) by default for maximum compatibility.
try {
  db.pragma('busy_timeout = 5000');
} catch (_) {
  /* ignore */
}
try {
  db.pragma('foreign_keys = ON');
} catch (_) {
  /* ignore */
}
try {
  db.pragma('synchronous = FULL');
} catch (_) {
  /* ignore */
}
try {
  db.pragma('journal_mode = DELETE');
} catch (_) {
  /* ignore */
}

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id                  TEXT PRIMARY KEY CHECK (id GLOB '${UUID_GLOB}'),
    filename            TEXT,
    original            TEXT,
    mimetype            TEXT,
    size                INTEGER,
    text                TEXT,
    summary             TEXT,
    tags                TEXT,
    metadataJson        TEXT,
    skillValue          TEXT,
    keyQuote            TEXT,
    useCase             TEXT,
    mediaType           TEXT,
    youtubeUrl          TEXT,
    timeRange           TEXT,
    impact              TEXT,
    contextText         TEXT,
    linkStatus          TEXT,
    relevance           INTEGER,
    exactTimestamp      TEXT,
    seal                TEXT,
    timestampStatus     TEXT,
    valueRank           INTEGER,
    mediaRank           INTEGER,
    curation            TEXT,
    playlist            TEXT,
    thumbnail           TEXT,
    videoId             TEXT,
    macroPillar         TEXT,
    subcategory         TEXT,
    sourceBook          TEXT,
    author              TEXT,
    kindleSectionChapter TEXT,
    kindlePage          TEXT,
    kindleLocation      TEXT,
    sourceArtifact      TEXT,
    originalSubtheme    TEXT,
    pillarId            TEXT,
    pillarName          TEXT,
    topicId             TEXT,
    topicName           TEXT,
    confidence          REAL,
    rationale           TEXT,
    status              TEXT DEFAULT 'pending',
    driveFileId         TEXT,
    driveUrl            TEXT,
    createdAt           TEXT DEFAULT (datetime('now')),
    updatedAt           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS itemTopics (
    itemId    TEXT NOT NULL CHECK (itemId GLOB '${UUID_GLOB}'),
    topicId   TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (itemId, topicId)
  );

  CREATE TABLE IF NOT EXISTS classification_log (
    id         TEXT PRIMARY KEY CHECK (id GLOB '${UUID_GLOB}'),
    itemId     TEXT,
    prompt     TEXT,
    response   TEXT,
    model      TEXT,
    tokens     INTEGER,
    createdAt  TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pillars (
    id         TEXT PRIMARY KEY,
    nameEn     TEXT NOT NULL,
    namePt     TEXT,
    sort       INTEGER,
    createdAt  TEXT DEFAULT (datetime('now')),
    updatedAt  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS topics (
    id         TEXT PRIMARY KEY,
    pillarId   TEXT NOT NULL,
    name       TEXT NOT NULL,
    sort       INTEGER,
    createdAt  TEXT DEFAULT (datetime('now')),
    updatedAt  TEXT DEFAULT (datetime('now'))
  );
`);

const getTableColumns = (tableName) => {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((c) => c.name);
  } catch {
    return [];
  }
};

const renameColumnIfNeeded = (tableName, fromName, toName) => {
  const cols = new Set(getTableColumns(tableName));
  if (!cols.has(fromName)) return;
  if (cols.has(toName)) return;
  try {
    db.exec(`ALTER TABLE ${tableName} RENAME COLUMN ${fromName} TO ${toName}`);
  } catch (_) {
    // Best-effort migration: ignore if SQLite version doesn't support it or table is in unexpected shape.
  }
};

const addColumnIfMissing = (tableName, colName, colType) => {
  const cols = new Set(getTableColumns(tableName));
  if (cols.has(colName)) return;
  try {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`);
  } catch (_) {
    /* ignore */
  }
};

// Migrations: rename legacy snake_case columns to camelCase
[
  ['items', 'pillar_id', 'pillarId'],
  ['items', 'pillar_name', 'pillarName'],
  ['items', 'topic_id', 'topicId'],
  ['items', 'topic_name', 'topicName'],
  ['items', 'drive_file_id', 'driveFileId'],
  ['items', 'drive_url', 'driveUrl'],
  ['items', 'created_at', 'createdAt'],
  ['items', 'updated_at', 'updatedAt'],
  // Migrations: rename legacy PT narrative columns to EN
  ['items', 'valorHabilidade', 'skillValue'],
  ['items', 'falaChave', 'keyQuote'],
  ['items', 'uso', 'useCase'],
  ['items', 'tipo', 'mediaType'],
  ['items', 'linkYoutube', 'youtubeUrl'],
  ['items', 'minutos', 'timeRange'],
  ['items', 'impacto', 'impact'],
  ['items', 'contexto', 'contextText'],
  ['items', 'relevancia', 'relevance'],
  ['items', 'timestampExato', 'exactTimestamp'],
  ['items', 'selo', 'seal'],
  ['items', 'rankingValor', 'valueRank'],
  ['items', 'rankingMidia', 'mediaRank'],
  ['items', 'curadoria', 'curation'],
  ['items', 'macroPilar', 'macroPillar'],
  ['items', 'subcategoria', 'subcategory'],
  ['items', 'livroOrigem', 'sourceBook'],
  ['items', 'autor', 'author'],
  ['items', 'secaoCapituloKindle', 'kindleSectionChapter'],
  ['items', 'paginaKindle', 'kindlePage'],
  ['items', 'posicaoLocKindle', 'kindleLocation'],
  ['items', 'arquivoOrigem', 'sourceArtifact'],
  ['items', 'subtemaOriginal', 'originalSubtheme'],
  ['classification_log', 'item_id', 'itemId'],
  ['classification_log', 'created_at', 'createdAt'],
  ['pillars', 'name_en', 'nameEn'],
  ['pillars', 'name_pt', 'namePt'],
  ['pillars', 'created_at', 'createdAt'],
  ['pillars', 'updated_at', 'updatedAt'],
  ['topics', 'pillar_id', 'pillarId'],
  ['topics', 'created_at', 'createdAt'],
  ['topics', 'updated_at', 'updatedAt'],
].forEach(([tableName, fromName, toName]) => renameColumnIfNeeded(tableName, fromName, toName));

// Migration: add Drive columns if upgrading from older versions
addColumnIfMissing('items', 'driveFileId', 'TEXT');
addColumnIfMissing('items', 'driveUrl', 'TEXT');

// Migration: ensure narrative/source columns exist on items (unified model)
addColumnIfMissing('items', 'metadataJson', 'TEXT');
addColumnIfMissing('items', 'linkStatus', 'TEXT');
addColumnIfMissing('items', 'timestampStatus', 'TEXT');
addColumnIfMissing('items', 'skillValue', 'TEXT');
addColumnIfMissing('items', 'keyQuote', 'TEXT');
addColumnIfMissing('items', 'useCase', 'TEXT');
addColumnIfMissing('items', 'mediaType', 'TEXT');
addColumnIfMissing('items', 'youtubeUrl', 'TEXT');
addColumnIfMissing('items', 'timeRange', 'TEXT');
addColumnIfMissing('items', 'impact', 'TEXT');
addColumnIfMissing('items', 'contextText', 'TEXT');
addColumnIfMissing('items', 'relevance', 'INTEGER');
addColumnIfMissing('items', 'exactTimestamp', 'TEXT');
addColumnIfMissing('items', 'seal', 'TEXT');
addColumnIfMissing('items', 'valueRank', 'INTEGER');
addColumnIfMissing('items', 'mediaRank', 'INTEGER');
addColumnIfMissing('items', 'curation', 'TEXT');
addColumnIfMissing('items', 'playlist', 'TEXT');
addColumnIfMissing('items', 'thumbnail', 'TEXT');
addColumnIfMissing('items', 'videoId', 'TEXT');
addColumnIfMissing('items', 'macroPillar', 'TEXT');
addColumnIfMissing('items', 'subcategory', 'TEXT');
addColumnIfMissing('items', 'sourceBook', 'TEXT');
addColumnIfMissing('items', 'author', 'TEXT');
addColumnIfMissing('items', 'kindleSectionChapter', 'TEXT');
addColumnIfMissing('items', 'kindlePage', 'TEXT');
addColumnIfMissing('items', 'kindleLocation', 'TEXT');
addColumnIfMissing('items', 'sourceArtifact', 'TEXT');
addColumnIfMissing('items', 'originalSubtheme', 'TEXT');

// Indexes (after migrations; best-effort for both legacy and new column names)
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_topics_pillarId ON topics (pillarId)');
} catch (_) {
  /* ignore */
}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_topics_pillar_id ON topics (pillar_id)');
} catch (_) {
  /* ignore */
}

try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_itemTopics_topicId ON itemTopics (topicId)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_itemTopics_itemId ON itemTopics (itemId)');
} catch (_) {
  /* ignore */
}

try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_videoId ON items (videoId)');
} catch (_) {
  /* ignore */
}

// UUID validation (works for existing DBs too, via triggers).
// Note: SQLite doesn't have a UUID type; we enforce a UUID-shaped TEXT.
try {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_items_uuid_insert
    BEFORE INSERT ON items
    WHEN NEW.id IS NOT NULL AND NEW.id NOT GLOB '${UUID_GLOB}'
    BEGIN
      SELECT RAISE(ABORT, 'items.id must be a UUID');
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_items_uuid_update
    BEFORE UPDATE OF id ON items
    WHEN NEW.id IS NOT NULL AND NEW.id NOT GLOB '${UUID_GLOB}'
    BEGIN
      SELECT RAISE(ABORT, 'items.id must be a UUID');
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_classification_log_uuid_insert
    BEFORE INSERT ON classification_log
    WHEN (
      (NEW.id IS NOT NULL AND NEW.id NOT GLOB '${UUID_GLOB}')
      OR (NEW.itemId IS NOT NULL AND NEW.itemId NOT GLOB '${UUID_GLOB}')
    )
    BEGIN
      SELECT RAISE(ABORT, 'classification_log.id/itemId must be UUID');
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_classification_log_uuid_update
    BEFORE UPDATE OF id, itemId ON classification_log
    WHEN (
      (NEW.id IS NOT NULL AND NEW.id NOT GLOB '${UUID_GLOB}')
      OR (NEW.itemId IS NOT NULL AND NEW.itemId NOT GLOB '${UUID_GLOB}')
    )
    BEGIN
      SELECT RAISE(ABORT, 'classification_log.id/itemId must be UUID');
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_itemTopics_uuid_insert
    BEFORE INSERT ON itemTopics
    WHEN NEW.itemId IS NOT NULL AND NEW.itemId NOT GLOB '${UUID_GLOB}'
    BEGIN
      SELECT RAISE(ABORT, 'itemTopics.itemId must be UUID');
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_itemTopics_uuid_update
    BEFORE UPDATE OF itemId ON itemTopics
    WHEN NEW.itemId IS NOT NULL AND NEW.itemId NOT GLOB '${UUID_GLOB}'
    BEGIN
      SELECT RAISE(ABORT, 'itemTopics.itemId must be UUID');
    END;
  `);
} catch (_) {
  // Best-effort: if CREATE TRIGGER IF NOT EXISTS isn't supported for some reason, don't crash startup.
}

const seedTaxonomy = () => {
  const upsertPillar = db.prepare(`
    INSERT INTO pillars (id, nameEn, namePt, sort)
    VALUES (@id, @nameEn, @namePt, @sort)
    ON CONFLICT(id) DO UPDATE SET
      nameEn = excluded.nameEn,
      namePt = excluded.namePt,
      sort = excluded.sort,
      updatedAt = datetime('now')
  `);

  const upsertTopic = db.prepare(`
    INSERT INTO topics (id, pillarId, name, sort)
    VALUES (@id, @pillarId, @name, @sort)
    ON CONFLICT(id) DO UPDATE SET
      pillarId = excluded.pillarId,
      name = excluded.name,
      sort = excluded.sort,
      updatedAt = datetime('now')
  `);

  const tx = db.transaction(() => {
    PILLARS.forEach((pillar, pillarIndex) => {
      upsertPillar.run({
        id: pillar.id,
        nameEn: pillar.name_en,
        namePt: pillar.name_pt,
        sort: pillarIndex,
      });

      (pillar.topics || []).forEach((topic, topicIndex) => {
        upsertTopic.run({
          id: topic.id,
          pillarId: pillar.id,
          name: topic.name,
          sort: topicIndex,
        });
      });
    });
  });

  tx();
};

seedTaxonomy();

module.exports = db;
