function getItem(ctx, { id }) {
  const item = ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  return ctx.itemRowToApi(item);
}

module.exports = { getItem };
