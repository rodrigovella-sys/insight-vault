function getHealth(ctx) {
  const driveEnabled = Boolean(ctx.driveEnabled);
  return {
    status: 'ok',
    version: '3.0',
    drive: driveEnabled ? 'enabled' : 'disabled',
    driveEnabled,
    storage: driveEnabled ? 'google-drive' : 'local',
    openaiEnabled: Boolean(ctx.openaiEnabled),
    youtubeEnabled: Boolean(ctx.youtubeEnabled),
    items: ctx.db.prepare('SELECT COUNT(*) as n FROM items').get().n,
  };
}

module.exports = { getHealth };
