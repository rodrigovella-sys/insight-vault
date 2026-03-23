async function listYoutubePlaylistItems(ctx, { url }) {
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

  const match = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (!match) {
    const err = new Error('Invalid playlist URL');
    err.status = 400;
    throw err;
  }
  const playlistId = match[1];

  const items = [];
  let pageToken;

  do {
    const ytRes = await ctx.youtube.playlistItems.list({
      part: ['snippet'],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    items.push(...(ytRes.data.items || []));
    pageToken = ytRes.data.nextPageToken;
  } while (pageToken);

  return { playlistId, items };
}

module.exports = { listYoutubePlaylistItems };
