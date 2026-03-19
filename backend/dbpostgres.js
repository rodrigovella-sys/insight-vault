// backend/dbpostgres.js — Postgres DB adapter for Insight Vault
// Provides a Postgres-backed ctx.db compatible with the app's DB usage.
// Connection is read from DATABASE_URL (do NOT hardcode secrets).

const { Pool } = require('pg');
const { PILLARS } = require('./taxonomy');

let pool = null;
let enabled = false;

function normalizeSqlForPostgres(sql) {
  let out = String(sql || '');

  // Compatibility conveniences
  out = out.replace(/\bdatetime\('now'\)\b/g, 'now()');
  out = out.replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT');
  out = out.replace(/\s+COLLATE\s+NOCASE\b/gi, '');

  return out;
}

function convertPlaceholders(sql) {
  // Convert positional placeholders (?) into $1, $2, ...
  let i = 0;
  return sql.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });
}

function convertNamedParams(sql, paramsObj) {
  // Convert @named params (@foo) into $1.. and build values array.
  // Assumes param names are simple identifiers.
  const values = [];
  const seen = new Map();

  const out = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(paramsObj, name)) {
      throw new Error(`Missing SQL named parameter: @${name}`);
    }
    if (seen.has(name)) return `$${seen.get(name)}`;
    values.push(paramsObj[name]);
    const idx = values.length;
    seen.set(name, idx);
    return `$${idx}`;
  });

  return { sql: out, values };
}

const KEY_MAP = {
  // Common aliases
  topiccount: 'topicCount',
  nextsort: 'nextSort',

  // pillars/topics columns
  nameen: 'nameEn',
  namept: 'namePt',
  pillarid: 'pillarId',
  createdat: 'createdAt',
  updatedat: 'updatedAt',

  // items columns (subset + frequently used)
  metadatajson: 'metadataJson',
  skillvalue: 'skillValue',
  keyquote: 'keyQuote',
  usecase: 'useCase',
  mediatype: 'mediaType',
  youtubeurl: 'youtubeUrl',
  timerange: 'timeRange',
  contexttext: 'contextText',
  linkstatus: 'linkStatus',
  relevancia: 'relevance',
  exacttimestamp: 'exactTimestamp',
  timestampstatus: 'timestampStatus',
  valuerank: 'valueRank',
  mediarank: 'mediaRank',
  macropillar: 'macroPillar',
  sourcebook: 'sourceBook',
  kindlesectionchapter: 'kindleSectionChapter',
  kindlepage: 'kindlePage',
  kindlelocation: 'kindleLocation',
  sourceartifact: 'sourceArtifact',
  originalsubtheme: 'originalSubtheme',
  drivefileid: 'driveFileId',
  driveurl: 'driveUrl',
  topicid: 'topicId',
  topicname: 'topicName',
  pillarname: 'pillarName',
  videoid: 'videoId',
  itemid: 'itemId',
};

function normalizeRowKeys(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const mapped = KEY_MAP[k] || k;
    out[mapped] = v;
  }
  return out;
}

function makeAdapter(queryFn, transactionFn) {
  return {
    prepare(sql) {
      return {
        async all(...params) {
          const { rows } = await queryFn(sql, params);
          return rows.map(normalizeRowKeys);
        },
        async get(...params) {
          const { rows } = await queryFn(sql, params);
          const row = rows[0] || undefined;
          return row ? normalizeRowKeys(row) : undefined;
        },
        async run(...params) {
          const res = await queryFn(sql, params);
          return { changes: res.rowCount || 0 };
        },
      };
    },

    async exec(sql) {
      await queryFn(sql, []);
    },

    transaction(fn) {
      // Returns a function that runs inside a transaction.
      return async (...args) => transactionFn((tx) => fn(tx, ...args));
    },

    async close() {
      // no-op for per-request adapters; pool is closed via module close()
    },
  };
}

async function migrate(client) {
  // NOTE: identifiers are unquoted -> folded to lowercase.
  // We intentionally keep the same *spelling* as existing app SQL, but lowercase,
  // and normalize keys back to camelCase in normalizeRowKeys().
  await client.query(`
    CREATE TABLE IF NOT EXISTS items (
      id                  uuid PRIMARY KEY,
      filename            text,
      original            text,
      mimetype            text,
      size                integer,
      text                text,
      summary             text,
      tags                text,
      metadatajson        text,
      skillvalue          text,
      keyquote            text,
      usecase             text,
      mediatype           text,
      youtubeurl          text,
      timerange           text,
      impact              text,
      contexttext         text,
      linkstatus          text,
      relevance           integer,
      exacttimestamp      text,
      seal                text,
      timestampstatus     text,
      valuerank           integer,
      mediarank           integer,
      curation            text,
      playlist            text,
      thumbnail           text,
      videoid             text,
      macropillar         text,
      subcategory         text,
      sourcebook          text,
      author              text,
      kindlesectionchapter text,
      kindlepage          text,
      kindlelocation      text,
      sourceartifact      text,
      originalsubtheme    text,
      pillarid            text,
      pillarname          text,
      topicid             text,
      topicname           text,
      confidence          double precision,
      rationale           text,
      status              text DEFAULT 'pending',
      drivefileid         text,
      driveurl            text,
      createdat           timestamptz DEFAULT now(),
      updatedat           timestamptz DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS itemtopics (
      itemid    uuid NOT NULL,
      topicid   text NOT NULL,
      createdat timestamptz DEFAULT now(),
      PRIMARY KEY (itemid, topicid)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS classification_log (
      id         uuid PRIMARY KEY,
      itemid     uuid,
      prompt     text,
      response   text,
      model      text,
      tokens     integer,
      createdat  timestamptz DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS pillars (
      id         text PRIMARY KEY,
      nameen     text NOT NULL,
      namept     text,
      sort       integer,
      createdat  timestamptz DEFAULT now(),
      updatedat  timestamptz DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS topics (
      id         text PRIMARY KEY,
      pillarid   text NOT NULL,
      name       text NOT NULL,
      sort       integer,
      createdat  timestamptz DEFAULT now(),
      updatedat  timestamptz DEFAULT now()
    );
  `);

  // Indexes (best-effort)
  await client.query('CREATE INDEX IF NOT EXISTS idx_topics_pillarid ON topics (pillarid)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_itemtopics_topicid ON itemtopics (topicid)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_itemtopics_itemid ON itemtopics (itemid)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_items_videoid ON items (videoid)');
}

async function seedTaxonomy(client) {
  const upsertPillar = `
    INSERT INTO pillars (id, nameEn, namePt, sort)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT(id) DO UPDATE SET
      nameEn = excluded.nameEn,
      namePt = excluded.namePt,
      sort = excluded.sort,
      updatedAt = now()
  `;

  const upsertTopic = `
    INSERT INTO topics (id, pillarId, name, sort)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT(id) DO UPDATE SET
      pillarId = excluded.pillarId,
      name = excluded.name,
      sort = excluded.sort,
      updatedAt = now()
  `;

  await client.query('BEGIN');
  try {
    for (let pillarIndex = 0; pillarIndex < PILLARS.length; pillarIndex += 1) {
      const pillar = PILLARS[pillarIndex];
      await client.query(upsertPillar, [pillar.id, pillar.name_en, pillar.name_pt, pillarIndex]);

      const topics = pillar.topics || [];
      for (let topicIndex = 0; topicIndex < topics.length; topicIndex += 1) {
        const topic = topics[topicIndex];
        await client.query(upsertTopic, [topic.id, pillar.id, topic.name, topicIndex]);
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function init() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    enabled = false;
    return false;
  }

  const sslDisabled = String(process.env.DISABLE_PG_SSL || '').toLowerCase() === 'true';

  pool = new Pool({
    connectionString: url,
    ssl: sslDisabled ? undefined : { rejectUnauthorized: false },
    max: 5,
  });

  // Validate connectivity + run migrations.
  const client = await pool.connect();
  try {
    await migrate(client);
    await seedTaxonomy(client);
  } finally {
    client.release();
  }

  enabled = true;
  return true;
}

function isEnabled() {
  return enabled && pool !== null;
}

async function close() {
  if (pool) {
    await pool.end();
  }
  pool = null;
  enabled = false;
}

async function queryRaw(sql, params) {
  if (!pool) {
    const err = new Error('Postgres is not initialized (missing DATABASE_URL)');
    err.status = 500;
    throw err;
  }

  let normalized = normalizeSqlForPostgres(sql);

  // Named params support: if first and only param is a plain object, treat it as named.
  if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    const { sql: namedSql, values } = convertNamedParams(normalized, params[0]);
    normalized = convertPlaceholders(namedSql); // allow mixed @name + ? (rare)
    return pool.query(normalized, values);
  }

  normalized = convertPlaceholders(normalized);
  return pool.query(normalized, params);
}

async function withTransaction(fn) {
  if (!pool) {
    const err = new Error('Postgres is not initialized (missing DATABASE_URL)');
    err.status = 500;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txQuery = async (sql, params) => {
      let normalized = normalizeSqlForPostgres(sql);

      if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
        const { sql: namedSql, values } = convertNamedParams(normalized, params[0]);
        normalized = convertPlaceholders(namedSql);
        const res = await client.query(normalized, values);
        return res;
      }

      normalized = convertPlaceholders(normalized);
      return client.query(normalized, params);
    };

    const txAdapter = makeAdapter(txQuery, async (innerFn) => innerFn(txAdapter));
    const result = await fn(txAdapter);

    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  } finally {
    client.release();
  }
}

const db = makeAdapter(
  async (sql, params) => {
    const res = await queryRaw(sql, params);
    return res;
  },
  withTransaction
);

module.exports = {
  init,
  isEnabled,
  close,
  db,
};
