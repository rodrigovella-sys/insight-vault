const path = require('path');
const fs = require('fs');

async function getItemFile(ctx, { id, resolve } = {}) {
  const item = await ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  // "Resolve" mode: only returns a URL when we have a stable place to open.
  // This is used by the UI to avoid opening a new tab that would just show JSON/404.
  if (resolve) {
    if (item.driveUrl) {
      return { kind: 'url', url: item.driveUrl };
    }

    // If drives are off (or there is no Drive file id), but this is a YouTube item,
    // use the YouTube URL as the file destination.
    if ((!ctx.driveEnabled && !ctx.driveSecondaryEnabled) || !item.driveFileId) {
      if (item.youtubeUrl) {
        return { kind: 'url', url: item.youtubeUrl };
      }
    }

    // Local fallback (open the standard endpoint, which streams the file).
    const localPath = path.join(ctx.UPLOAD_DIR, item.filename);
    if (item.filename && fs.existsSync(localPath)) {
      return { kind: 'url', url: `/items/${encodeURIComponent(item.id)}/file` };
    }

    const err = new Error('File URL not available');
    err.status = 404;
    throw err;
  }

  if (item.driveFileId && ctx.driveEnabled) {
    try {
      const buffer = await ctx.drive.download(item.driveFileId);
      return {
        kind: 'buffer',
        buffer,
        mimetype: item.mimetype || 'application/octet-stream',
        original: item.original,
      };
    } catch (errPrimary) {
      if (ctx.driveSecondaryEnabled && ctx.driveSecondary) {
        try {
          const buffer = await ctx.driveSecondary.download(item.driveFileId);
          return {
            kind: 'buffer',
            buffer,
            mimetype: item.mimetype || 'application/octet-stream',
            original: item.original,
          };
        } catch {
          // fall through to local storage / 404
        }
      }
      // If Drive was enabled but the file isn't there (or provider mismatch),
      // continue trying local storage before returning 404.
    }
  }

  const localPath = path.join(ctx.UPLOAD_DIR, item.filename);
  if (fs.existsSync(localPath)) {
    return {
      kind: 'file',
      path: localPath,
      mimetype: item.mimetype || 'application/octet-stream',
    };
  }

  // If drives are off (or the item doesn't have a Drive file id) and we have a YouTube URL,
  // fall back to opening the YouTube content.
  if (((!ctx.driveEnabled && !ctx.driveSecondaryEnabled) || !item.driveFileId) && item.youtubeUrl) {
    return {
      kind: 'redirect',
      url: item.youtubeUrl,
    };
  }

  const err = new Error('File not found in Drive or local storage');
  err.status = 404;
  throw err;
}

module.exports = { getItemFile };
