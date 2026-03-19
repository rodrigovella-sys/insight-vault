const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let restoreInProgress = false;

function restoreDatabase(ctx, { fileName }) {
  if (restoreInProgress) {
    const err = new Error('Database restore already in progress');
    err.status = 409;
    throw err;
  }

  if (!fileName) {
    const err = new Error('Missing fileName');
    err.status = 400;
    throw err;
  }

  const safeName = path.basename(String(fileName));
  if (safeName !== fileName) {
    const err = new Error('Invalid fileName');
    err.status = 400;
    throw err;
  }
  if (!safeName.toLowerCase().endsWith('.db')) {
    const err = new Error('Invalid backup file (expected .db)');
    err.status = 400;
    throw err;
  }

  const backendDir = path.join(__dirname, '..', '..', '..');
  const backupDir = path.join(backendDir, 'backups');
  const sourcePath = path.join(backupDir, safeName);
  const destPath = path.join(backendDir, 'vault.db');
  const tempPath = path.join(backendDir, `vault.db.restore-${Date.now()}.tmp`);

  if (!fs.existsSync(sourcePath)) {
    const err = new Error('Backup file not found');
    err.status = 404;
    throw err;
  }

  restoreInProgress = true;
  let shouldExit = false;
  try {
    // Validate that the backup is readable and structurally sound before applying it.
    try {
      const backupDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
      const integrity = backupDb.prepare('PRAGMA integrity_check').all();
      backupDb.close();
      const ok = Array.isArray(integrity) && integrity.length === 1 && integrity[0].integrity_check === 'ok';
      if (!ok) {
        const err = new Error('Backup failed integrity_check');
        err.status = 400;
        throw err;
      }
    } catch (e) {
      const err = new Error(`Backup is not valid: ${e.message}`);
      err.status = e.status || 400;
      throw err;
    }

    // Ensure the DB is not holding any locks.
    try {
      ctx.db.exec('PRAGMA wal_checkpoint(FULL)');
    } catch {
      // Ignore if not in WAL mode.
    }

    ctx.db.close();
    // From this point on, the process must restart so the app can reopen the DB cleanly.
    shouldExit = true;

    fs.copyFileSync(sourcePath, tempPath);
    fs.copyFileSync(tempPath, destPath);
    fs.unlinkSync(tempPath);

    // The current process is running with a closed DB handle.
    // We request a restart so the app can reopen the DB cleanly.
    return {
      ok: true,
      restoredFrom: safeName,
      requiresRestart: true,
    };
  } finally {
    // If we closed the DB handle, we must exit. Otherwise, let the process keep running.
    if (shouldExit) {
      // keep restoreInProgress true until exit, so no more requests try to use the closed handle.
      setTimeout(() => process.exit(0), 250);
    } else {
      restoreInProgress = false;
    }
  }
}

module.exports = { restoreDatabase };
