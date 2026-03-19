async function getVault(ctx, { pillar, status, search }) {
  let sql = 'SELECT * FROM items WHERE 1=1';
  const params = [];

  if (pillar) {
    sql += ' AND pillarId = ?';
    params.push(pillar);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (summary LIKE ? OR tags LIKE ? OR original LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  sql += ' ORDER BY createdAt DESC';

  const rows = await ctx.db.prepare(sql).all(...params);
  return rows.map(ctx.itemRowToApi);
}

module.exports = { getVault };
