const fs = require('fs');
const path = require('path');

function formatUtcTimestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function toSqliteStringLiteral(filePath) {
  // VACUUM INTO does not support bind parameters; escape single quotes.
  const normalized = filePath.replace(/\\/g, '/');
  return `'${normalized.replace(/'/g, "''")}'`;
}

function backupDatabase(ctx) {
  const backendDir = path.join(__dirname, '..', '..', '..');
  const backupDir = path.join(backendDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const fileName = `vault.backup-${formatUtcTimestampForFilename()}.db`;
  const backupPath = path.join(backupDir, fileName);

  ctx.db.exec(`VACUUM INTO ${toSqliteStringLiteral(backupPath)}`);

  const stat = fs.statSync(backupPath);
  return {
    fileName,
    sizeBytes: stat.size,
    createdAtUtc: new Date(stat.mtimeMs).toISOString(),
  };
}

module.exports = { backupDatabase };
