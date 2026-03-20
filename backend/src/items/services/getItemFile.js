const path = require('path');
const fs = require('fs');

async function getItemFile(ctx, { id }) {
  const item = await ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) {
    const err = new Error('Not found');
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

  const err = new Error('File not found in Drive or local storage');
  err.status = 404;
  throw err;
}

module.exports = { getItemFile };
