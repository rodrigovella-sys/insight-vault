const { v4: uuidv4, v5: uuidv5 } = require('uuid');

const UUID_NAMESPACE = '0a7b3c2e-8c2b-4e3d-9e0a-2f6e3b2e1a11';

function parseYoutubeUrl(input) {
  try {
    const u = new URL(String(input || '').trim());
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname || '/';

    const playlistId = u.searchParams.get('list') || null;

    // Common patterns:
    // - youtube.com/watch?v=VIDEO_ID
    // - youtu.be/VIDEO_ID
    // - youtube.com/shorts/VIDEO_ID
    // - youtube.com/embed/VIDEO_ID
    // - youtube.com/live/VIDEO_ID
    let videoId = u.searchParams.get('v');

    if (!videoId && host === 'youtu.be') {
      const seg = path.split('/').filter(Boolean)[0];
      if (seg) videoId = seg;
    }

    if (!videoId) {
      const m = path.match(/^\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
      if (m) videoId = m[2];
    }

    if (!videoId) {
      // Fallback: try to find any 11-char id after v= or / in the raw string.
      const raw = String(input || '');
      const m = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
      if (m) videoId = m[1];
    }

    if (videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      videoId = null;
    }

    return { videoId: videoId || null, playlistId, normalizedUrl: u.toString() };
  } catch {
    return { videoId: null, playlistId: null, normalizedUrl: String(input || '').trim() };
  }
}

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

  const parsed = parseYoutubeUrl(url);
  if (!parsed.videoId) {
    if (parsed.playlistId) {
      const err = new Error('This is a playlist URL. Use the playlist import endpoint (/youtube/playlist).');
      err.status = 400;
      throw err;
    }
    const err = new Error('Invalid YouTube URL');
    err.status = 400;
    throw err;
  }
  const videoId = parsed.videoId;

  // Fast path: if we already imported this video before, return it.
  // (Keeps older DBs compatible where videoId may not be populated.)
  const existing = await ctx.db
    .prepare("SELECT * FROM items WHERE (videoId = ? OR filename = ?) AND mimetype = 'video/youtube' ORDER BY createdAt DESC LIMIT 1")
    .get(videoId, `yt_${videoId}`);
  if (existing) {
    return { ...ctx.itemRowToApi(existing), duplicate: true };
  }

  const ytRes = await ctx.youtube.videos.list({ part: ['snippet'], id: [videoId] });
  const video = ytRes.data.items?.[0];
  if (!video) {
    const err = new Error('Video not found');
    err.status = 404;
    throw err;
  }

  const { title, description, channelTitle } = video.snippet;
  const text = `Title: ${title}\nChannel: ${channelTitle}\n\n${description}`;

  const thumbnail = video.snippet.thumbnails?.default?.url || video.snippet.thumbnails?.medium?.url || null;

  const { result, tokens, prompt } = await ctx.classify(text, title);
  const pillar = ctx.PILLARS.find((p) => p.id === result.pillarId) || ctx.PILLARS[0];
  const topic = pillar.topics.find((t) => t.id === result.topicId) || pillar.topics[0];

  const dbTaxonomy = ctx.apiItemToDbClassification(pillar, topic);

  const id = uuidv5(`youtube:${videoId}`, UUID_NAMESPACE);
  await ctx.db
    .prepare(
      `
      INSERT INTO items
        (id, filename, original, mimetype, size, text, summary, tags,
         youtubeUrl, videoId, thumbnail,
         pillarId, pillarName, topicId, topicName, confidence, rationale, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'classified')
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
      parsed.normalizedUrl || url,
      videoId,
      thumbnail,
      dbTaxonomy.pillarId,
      dbTaxonomy.pillarName,
      dbTaxonomy.topicId,
      dbTaxonomy.topicName,
      result.confidence,
      result.rationale
    );

  await ctx.db
    .prepare(
      `
      INSERT INTO classification_log (id, itemId, prompt, response, model, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
    .run(uuidv4(), id, prompt, JSON.stringify(result), 'gpt-4o-mini', tokens);

  const item = await ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return ctx.itemRowToApi(item);
}

module.exports = { createYoutubeItem };
