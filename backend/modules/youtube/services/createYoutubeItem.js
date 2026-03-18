const { v4: uuidv4 } = require('uuid');

async function createYoutubeItem(ctx, { url }) {
  if (!url) {
    const err = new Error('Missing url');
    err.status = 400;
    throw err;
  }
  if (!ctx.youtube) {
    const err = new Error('YouTube is not configured (missing YOUTUBE_API_KEY)');
    err.status = 400;
    throw err;
  }

  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!match) {
    const err = new Error('Invalid YouTube URL');
    err.status = 400;
    throw err;
  }
  const videoId = match[1];

  const ytRes = await ctx.youtube.videos.list({ part: ['snippet'], id: [videoId] });
  const video = ytRes.data.items?.[0];
  if (!video) {
    const err = new Error('Video not found');
    err.status = 404;
    throw err;
  }

  const { title, description, channelTitle } = video.snippet;
  const text = `Title: ${title}\nChannel: ${channelTitle}\n\n${description}`;

  const { result, tokens, prompt } = await ctx.classify(text, title);
  const pillar = ctx.PILLARS.find((p) => p.id === result.pillarId) || ctx.PILLARS[0];
  const topic = pillar.topics.find((t) => t.id === result.topicId) || pillar.topics[0];

  const dbTaxonomy = ctx.apiItemToDbClassification(pillar, topic);

  const id = uuidv4();
  ctx.db
    .prepare(
      `
      INSERT INTO items
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

  const item = ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return ctx.itemRowToApi(item);
}

module.exports = { createYoutubeItem };
