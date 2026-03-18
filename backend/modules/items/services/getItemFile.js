const path = require('path');
const fs = require('fs');

async function getItemFile(ctx, { id }) {
  const item = ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  if (item.driveFileId && ctx.driveEnabled) {
    const buffer = await ctx.drive.download(item.driveFileId);
    return {
      kind: 'buffer',
      buffer,
      mimetype: item.mimetype || 'application/octet-stream',
      original: item.original,
    };
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
