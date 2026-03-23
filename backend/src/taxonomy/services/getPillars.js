async function getPillars(ctx) {
  const db = ctx.db;

  const rows = await db
    .prepare(
      `
      SELECT
        p.id AS id,
        p.nameEn AS nameEn,
        p.namePt AS namePt,
        (
          SELECT COUNT(1)
          FROM topics t
          WHERE t.pillarId = p.id
        ) AS topicCount
      FROM pillars p
      ORDER BY COALESCE(p.sort, 999999) ASC, p.nameEn ASC
    `
    )
    .all();

  return rows.map((r) => ({
    id: r.id,
    nameEn: r.nameEn,
    namePt: r.namePt,
    topicCount: r.topicCount || 0,
  }));
}

module.exports = { getPillars };
