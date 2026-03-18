const fs = require('fs');
const path = require('path');

const { restoreDatabase } = require('./restoreDatabase');

function getLatestBackupFileName(backupDir) {
  if (!fs.existsSync(backupDir)) return null;

  const candidates = fs
    .readdirSync(backupDir)
    .filter((name) => name.toLowerCase().endsWith('.db'))
    .map((name) => {
      const fullPath = path.join(backupDir, name);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        return null;
      }
      return { name, mtimeMs: stat.mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0]?.name || null;
}

function runQuickCheck(ctx) {
  const rows = ctx.db.prepare('PRAGMA quick_check').all();
  const values = rows
    .map((r) => r.quick_check)
    .filter((v) => typeof v === 'string');

  const ok = values.length === 1 && values[0] === 'ok';
  return { ok, values };
}

function recoverDatabase(ctx, { fileName } = {}) {
  const backendDir = path.join(__dirname, '..', '..', '..');
  const backupDir = path.join(backendDir, 'backups');

  let check;
  try {
    check = runQuickCheck(ctx);
  } catch (e) {
    check = { ok: false, values: [`quick_check_failed: ${e.message}`] };
  }

  if (check.ok) {
    return {
      ok: true,
      integrity: 'ok',
      action: 'none',
      check,
    };
  }

  const chosenFileName = fileName || getLatestBackupFileName(backupDir);
  if (!chosenFileName) {
    const err = new Error('No backups available to recover from');
    err.status = 404;
    throw err;
  }

  const restoreResult = restoreDatabase(ctx, { fileName: chosenFileName });
  return {
    ok: true,
    integrity: 'corrupt',
    action: 'restored',
    check,
    ...restoreResult,
  };
}

module.exports = { recoverDatabase };
