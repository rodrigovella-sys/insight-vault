async function getTopics(ctx, { pillarId }) {
  const db = ctx.db;

  const pillar = await db.prepare('SELECT id FROM pillars WHERE id = ?').get(pillarId);
  if (!pillar) {
    const err = new Error('Pillar not found');
    err.status = 404;
    throw err;
  }

  return await db
    .prepare(
      `
      SELECT id, name
      FROM topics
      WHERE pillarId = ?
      ORDER BY COALESCE(sort, 999999) ASC, name ASC
    `
    )
    .all(pillarId);
}

module.exports = { getTopics };
