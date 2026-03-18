const { v4: uuidv4 } = require('uuid');

async function processYoutubePlaylistItems(ctx, { items }) {
  for (const item of items) {
    try {
      const videoId = item.snippet.resourceId.videoId;
      const title = item.snippet.title;
      const desc = item.snippet.description || '';
      const text = `Title: ${title}\n\n${desc}`;

      const { result, tokens, prompt } = await ctx.classify(text, title);
      const pillar = ctx.PILLARS.find((p) => p.id === result.pillarId) || ctx.PILLARS[0];
      const topic = pillar.topics.find((t) => t.id === result.topicId) || pillar.topics[0];
      const dbTaxonomy = ctx.apiItemToDbClassification(pillar, topic);

      const id = uuidv4();
      ctx.db
        .prepare(
          `
          INSERT OR IGNORE INTO items
            (id, filename, original, mimetype, size, text, summary, tags,
             pillarId, pillarName, topicId, topicName, confidence, rationale, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'classified')
        `
        )
        .run(
          id,
          `yt_${videoId}`,
          title,
          'video/youtube',
          0,
          text.slice(0, 5000),
          result.summary,
          JSON.stringify(result.tags || []),
          dbTaxonomy.pillarId,
          dbTaxonomy.pillarName,
          dbTaxonomy.topicId,
          dbTaxonomy.topicName,
          result.confidence,
          result.rationale
        );

      ctx.db
        .prepare(
          `
          INSERT INTO classification_log (id, itemId, prompt, response, model, tokens)
          VALUES (?, ?, ?, ?, ?, ?)
        `
        )
        .run(uuidv4(), id, prompt, JSON.stringify(result), 'gpt-4o-mini', tokens);
    } catch (e) {
      // Keep prior behavior: skip and continue.
      console.error(`[playlist] skip "${item.snippet.title}":`, e.message);
    }
  }

  console.log('[playlist] done processing');
}

module.exports = { processYoutubePlaylistItems };
