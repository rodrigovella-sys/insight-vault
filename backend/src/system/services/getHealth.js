async function getHealth(ctx) {
  const driveEnabled = Boolean(ctx.driveEnabled);
  const countRow = await ctx.db.prepare('SELECT COUNT(*) as n FROM items').get();
  return {
    status: 'ok',
    version: '3.0',
    db: ctx.dbType || 'postgres',
    drive: driveEnabled ? 'enabled' : 'disabled',
    driveEnabled,
    storage: driveEnabled ? (ctx.storageKind || 'google-drive') : 'local',
    openaiEnabled: Boolean(ctx.openaiEnabled),
    youtubeEnabled: Boolean(ctx.youtubeEnabled),
    items: countRow?.n || 0,
  };
}

module.exports = { getHealth };
