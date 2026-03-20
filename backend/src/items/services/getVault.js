async function getVault(ctx, { pillar, topicId, status, search, limit, offset } = {}) {
  let whereSql = ' FROM items WHERE 1=1';
  const params = [];

  if (pillar) {
    whereSql += ' AND pillarId = ?';
    params.push(pillar);
  }
  if (topicId) {
    whereSql += ' AND topicId = ?';
    params.push(topicId);
  }
  if (status) {
    whereSql += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    // Postgres-only backend: ILIKE provides case-insensitive matching.
    whereSql += ' AND (summary ILIKE ? OR tags ILIKE ? OR original ILIKE ? OR pillarName ILIKE ? OR topicName ILIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  const wantsPagination = Number.isFinite(Number(limit)) || Number.isFinite(Number(offset));
  if (!wantsPagination) {
    const sql = `SELECT *${whereSql} ORDER BY createdAt DESC`;
    const rows = await ctx.db.prepare(sql).all(...params);
    return rows.map(ctx.itemRowToApi);
  }

  const safeLimit = Math.max(1, Math.min(200, Number.parseInt(String(limit ?? 20), 10) || 20));
  const safeOffset = Math.max(0, Number.parseInt(String(offset ?? 0), 10) || 0);

  const countRow = await ctx.db.prepare(`SELECT COUNT(*) AS n${whereSql}`).get(...params);
  const total = Number.parseInt(String(countRow?.n ?? 0), 10) || 0;

  const rows = await ctx.db
    .prepare(`SELECT *${whereSql} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
    .all(...params, safeLimit, safeOffset);

  return {
    items: rows.map(ctx.itemRowToApi),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

module.exports = { getVault };
