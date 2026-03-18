function getPillars(ctx) {
  return ctx.PILLARS.map((p) => ({
    id: p.id,
    nameEn: p.name_en,
    namePt: p.name_pt,
    topicCount: p.topics.length,
  }));
}

module.exports = { getPillars };
