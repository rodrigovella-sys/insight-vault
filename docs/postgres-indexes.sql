-- Postgres index suggestions for Insight Vault
--
-- Notes:
-- - Use CONCURRENTLY on a live system to reduce write blocking.
-- - CONCURRENTLY cannot run inside a transaction.
-- - Some statements require elevated privileges (CREATE EXTENSION).
--
-- Core btree indexes (should be safe defaults)
-- (These are also added in backend/dbpostgres.js migrate())

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_createdat_desc
  ON items (createdAt DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_pillarid_topicid_createdat_desc
  ON items (pillarId, topicId, createdAt DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_status_createdat_desc
  ON items (status, createdAt DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_pillarid_sort_name
  ON topics (pillarId, sort, name);

-- Case-insensitive existence checks used by createTopic()
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_pillarid_lower_name
  ON topics (pillarId, lower(name));

-- Optional: enforce unique topic names per pillar (case-insensitive)
-- Run this only after confirming there are no duplicates.
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_topics_pillarid_lower_name
--   ON topics (pillarId, lower(name));

-- Optional: speed up Vault search LIKE '%...%'
-- Requires pg_trgm extension.
-- If you cannot enable extensions, consider switching to full-text search instead.
--
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_summary_trgm
--   ON items USING gin (summary gin_trgm_ops);
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_original_trgm
--   ON items USING gin (original gin_trgm_ops);
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_tags_trgm
--   ON items USING gin (tags gin_trgm_ops);

-- Optional: if JSONB predicates become production queries (import/debug scripts)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_metadata_sourceType
--   ON items ((metadataJson::jsonb->>'sourceType'));
