function getTopics(ctx, { pillarId }) {
  const pillar = ctx.PILLARS.find((p) => p.id === pillarId);
  if (!pillar) {
    const err = new Error('Pillar not found');
    err.status = 404;
    throw err;
  }
  return pillar.topics;
}

module.exports = { getTopics };
