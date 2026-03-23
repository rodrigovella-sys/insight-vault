const { v4: uuidv4, v5: uuidv5 } = require('uuid');

const UUID_NAMESPACE = '0a7b3c2e-8c2b-4e3d-9e0a-2f6e3b2e1a11';

async function processYoutubePlaylistItems(ctx, { items, playlistId, skipVideoIds } = {}) {
  const skip = new Set(skipVideoIds || []);
  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const videoId = item.snippet.resourceId.videoId;
      if (skip.has(videoId)) {
        skipped += 1;
        continue;
      }

      const title = item.snippet.title;
      const desc = item.snippet.description || '';
      const thumbnail = item.snippet.thumbnails?.default?.url || item.snippet.thumbnails?.medium?.url || null;
      const youtubeUrl = playlistId
        ? `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`
        : `https://www.youtube.com/watch?v=${videoId}`;
      const text = `Title: ${title}\n\n${desc}`;

      const { result, tokens, prompt } = await ctx.classify(text, title);
      const pillar = ctx.PILLARS.find((p) => p.id === result.pillarId) || ctx.PILLARS[0];
      const topic = pillar.topics.find((t) => t.id === result.topicId) || pillar.topics[0];
      const dbTaxonomy = ctx.apiItemToDbClassification(pillar, topic);

      const id = uuidv5(`youtube:${videoId}`, UUID_NAMESPACE);
      const res = await ctx.db
        .prepare(
          `
          INSERT INTO items
            (id, filename, original, mimetype, size, text, summary, tags,
             youtubeUrl, playlist, videoId, thumbnail,
             pillarId, pillarName, topicId, topicName, confidence, rationale, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'classified')
          ON CONFLICT (id) DO NOTHING
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
          youtubeUrl,
          playlistId || null,
          videoId,
          thumbnail,
          dbTaxonomy.pillarId,
          dbTaxonomy.pillarName,
          dbTaxonomy.topicId,
          dbTaxonomy.topicName,
          result.confidence,
          result.rationale
        );

      processed += 1;
      if (res?.changes && Number(res.changes) > 0) {
        imported += 1;
      } else {
        skipped += 1;
      }

      await ctx.db
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
      failed += 1;
    }
  }

  console.log('[playlist] done processing', { total: items.length, processed, imported, skipped, failed });

  return { total: items.length, processed, imported, skipped, failed, playlistId: playlistId || null };
}

module.exports = { processYoutubePlaylistItems };
