function getHealth(ctx) {
  return {
    status: 'ok',
    version: '3.0',
    drive: ctx.driveEnabled ? 'enabled' : 'disabled',
    items: ctx.db.prepare('SELECT COUNT(*) as n FROM items').get().n,
  };
}

module.exports = { getHealth };
