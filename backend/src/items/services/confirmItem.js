function confirmItem(ctx, { id }) {
  const result = ctx.db
    .prepare("UPDATE items SET status = 'confirmed', updatedAt = datetime('now') WHERE id = ?")
    .run(id);

  if (!result.changes) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  const item = ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return ctx.itemRowToApi(item);
}

module.exports = { confirmItem };
