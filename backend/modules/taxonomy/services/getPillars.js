function getPillars(ctx) {
  return ctx.PILLARS.map((p) => ({
    id: p.id,
    name_en: p.name_en,
    name_pt: p.name_pt,
    topic_count: p.topics.length,
  }));
}

module.exports = { getPillars };
