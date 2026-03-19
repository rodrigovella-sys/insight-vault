function createTopic(ctx, { pillarId, name }) {
  const db = ctx.db;

  const trimmedName = String(name || '').trim();
  if (!pillarId) {
    const err = new Error('pillarId is required');
    err.status = 400;
    throw err;
  }
  if (!trimmedName) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  const pillar = db.prepare('SELECT id FROM pillars WHERE id = ?').get(pillarId);
  if (!pillar) {
    const err = new Error('Pillar not found');
    err.status = 404;
    throw err;
  }

  const existing = db
    .prepare('SELECT id, name FROM topics WHERE pillarId = ? AND name = ? COLLATE NOCASE LIMIT 1')
    .get(pillarId, trimmedName);
  if (existing) {
    const err = new Error('Topic already exists in this pillar');
    err.status = 409;
    throw err;
  }

  const nextSortRow = db
    .prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS nextSort FROM topics WHERE pillarId = ?')
    .get(pillarId);

  const createWithSequentialId = db.transaction(() => {
    const idPrefix = `${pillarId}.`;
    const rows = db
      .prepare('SELECT id FROM topics WHERE pillarId = ? AND id LIKE ?')
      .all(pillarId, `${idPrefix}%`);

    let maxSeq = 0;
    for (const row of rows) {
      const id = String(row.id || '');
      if (!id.startsWith(idPrefix)) continue;
      const suffix = id.slice(idPrefix.length);
      if (!/^[0-9]+$/.test(suffix)) continue;
      const n = Number.parseInt(suffix, 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }

    // Find the next available ID (handles gaps or rare conflicts).
    for (let seq = maxSeq + 1; seq < maxSeq + 10000; seq += 1) {
      const candidate = `${idPrefix}${String(seq).padStart(2, '0')}`;
      const exists = db.prepare('SELECT 1 FROM topics WHERE id = ? LIMIT 1').get(candidate);
      if (exists) continue;
      return candidate;
    }

    const err = new Error('Could not allocate topic id');
    err.status = 500;
    throw err;
  });

  const id = createWithSequentialId();

  const topic = {
    id,
    pillarId,
    name: trimmedName,
    sort: nextSortRow?.nextSort ?? 0,
  };

  db.prepare('INSERT INTO topics (id, pillarId, name, sort) VALUES (@id, @pillarId, @name, @sort)').run(topic);

  return { id: topic.id, name: topic.name };
}

module.exports = { createTopic };
