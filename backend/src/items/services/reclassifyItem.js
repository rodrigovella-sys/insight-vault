async function reclassifyItem(ctx, { id, pillarId, topicId }) {
  const pillar = ctx.PILLARS.find((p) => p.id === pillarId);
  if (!pillar) {
    const err = new Error('Invalid pillarId');
    err.status = 400;
    throw err;
  }

  const topic = pillar.topics.find((t) => t.id === topicId);
  if (!topic) {
    const err = new Error('Invalid topicId');
    err.status = 400;
    throw err;
  }

  const dbTaxonomy = ctx.apiItemToDbClassification(pillar, topic);

  const result = await ctx.db
    .prepare(
      `
      UPDATE items
      SET pillarId = ?, pillarName = ?, topicId = ?, topicName = ?,
          status = 'confirmed', updatedAt = datetime('now')
      WHERE id = ?
    `
    )
    .run(dbTaxonomy.pillarId, dbTaxonomy.pillarName, dbTaxonomy.topicId, dbTaxonomy.topicName, id);

  if (!result.changes) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  const item = await ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return ctx.itemRowToApi(item);
}

module.exports = { reclassifyItem };
