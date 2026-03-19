// backend/drive.js — Google Drive integration for Insight Vault v3.0
// Auth:
// - Preferred: Service Account JSON via GOOGLE_SERVICE_ACCOUNT_KEY
// Supports automatic subfolder creation per pillar/topic

const { google } = require('googleapis');
const { Readable } = require('stream');

let driveClient = null;
let FOLDER_ID = null;

let rootFolderChecked = false;
let rootFolderDriveId = null;

// In-memory cache for folder IDs (avoids repeated API calls)
const folderCache = {};

function escapeDriveQueryValue(value) {
  // Escape for Drive query strings: wrap with single quotes in the query,
  // so we only need to escape backslashes and single quotes.
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function init() {

  // Reset any previous state (useful for restarts/tests)
  driveClient = null;
  rootFolderChecked = false;
  rootFolderDriveId = null;
  for (const k of Object.keys(folderCache)) delete folderCache[k];

  FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!FOLDER_ID) {
    console.warn('✗ disabled — GOOGLE_DRIVE_FOLDER_ID not set. Set it to enable Google Drive integration.');
    return false;
  } else {
    console.warn(`✓ enabled (Google Drive Folder) ID: ${FOLDER_ID}`);
  }

  // Preferred: Service Account JSON in env
  const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw) {
    let serviceAccountKey;
    try {
      serviceAccountKey = JSON.parse(serviceAccountRaw);
    } catch (err) {
      console.warn(
        '✗ disabled — GOOGLE_SERVICE_ACCOUNT_KEY is set but could not be parsed as JSON. ' +
          'Ensure it is a single-line JSON string.'
      );
      return false;
    }
    if (!serviceAccountKey) {
      console.warn(
        '✗ disabled — GOOGLE_SERVICE_ACCOUNT_KEY is set but could not be parsed as JSON. Ensure it is a single-line JSON string.'
      );
      return false;
    } else if (!serviceAccountKey.client_email || !serviceAccountKey.private_key) {
      console.warn(
        '✗ disabled — GOOGLE_SERVICE_ACCOUNT_KEY JSON is missing required fields (client_email/private_key).'
      );
      return false;
    } else {
      try {
        // Normalize key formatting: common env/.env mistakes are having literal "\\n" instead of newlines.
        if (typeof serviceAccountKey.private_key === 'string') {
          let pk = serviceAccountKey.private_key;
          pk = pk.replace(/\r\n/g, '\n');
          pk = pk.replace(/\\n/g, '\n');
          pk = pk.trim();

          // Sometimes values are double-quoted inside JSON/env.
          if ((pk.startsWith('"') && pk.endsWith('"')) || (pk.startsWith("'") && pk.endsWith("'"))) {
            pk = pk.slice(1, -1).trim();
          }

          // If key is base64-encoded PEM, decode it.
          if (!pk.includes('BEGIN ') && /^[A-Za-z0-9+/=\s]+$/.test(pk) && pk.length > 256) {
            try {
              const decoded = Buffer.from(pk.replace(/\s+/g, ''), 'base64').toString('utf8');
              if (decoded.includes('BEGIN ')) pk = decoded.trim();
            } catch {
              // ignore
            }
          }

          if (pk.includes('BEGIN ENCRYPTED PRIVATE KEY')) {
            console.warn(
              '✗ disabled — Service Account private_key is encrypted. Generate a new JSON key (unencrypted) in Google Cloud.'
            );
            return false;
          }

          serviceAccountKey.private_key = pk;
        }

        const jwtClient = new google.auth.JWT({
          email: serviceAccountKey.client_email,
          key: serviceAccountKey.private_key,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
        driveClient = google.drive({ version: 'v3', auth: jwtClient });
        console.warn('✓ enabled  (Service Account) Service Account client initialized');
        return true;
      } catch (err) {
        console.error('✗ disabled — Service Account init error:', err.message);
        console.error(
          'Hint: ensure GOOGLE_SERVICE_ACCOUNT_KEY.private_key is a PEM string with real newlines (not literal \\n).'
        );
        return false;
      }
    }
  }

  console.warn('✗ disabled — GOOGLE_SERVICE_ACCOUNT_KEY not set. Set it to enable Google Drive integration.');
  return false;
}

function isEnabled() {
  return driveClient !== null;
}

async function ensureRootFolderIsSharedDrive() {
  if (rootFolderChecked) return;
  rootFolderChecked = true;

  try {
    const meta = await driveClient.files.get({
      fileId: FOLDER_ID,
      fields: 'id, name, driveId',
      supportsAllDrives: true,
    });

    rootFolderDriveId = meta?.data?.driveId || null;
    if (!rootFolderDriveId) {
      const folderName = meta?.data?.name ? `"${meta.data.name}"` : '(unknown name)';
      const e = new Error(
        'Google Drive is configured with a Service Account but the target folder is not in a Shared Drive. ' +
          `Folder: ${folderName}. ` +
          'Service Accounts do not have storage quota in My Drive. ' +
          'Move/create the folder inside a Shared Drive, add the Service Account email as a member, and set GOOGLE_DRIVE_FOLDER_ID to that folder.'
      );
      e.status = 403;
      throw e;
    }
  } catch (err) {
    // If we already have a friendly error, bubble it up.
    if (err && typeof err === 'object' && 'status' in err) throw err;
    // Otherwise, don't block uploads here; the real call will throw a detailed gaxios error.
  }
}

/**
 * Get or create a subfolder inside a parent folder.
 * Uses in-memory cache to avoid repeated API calls.
 * @returns {Promise<string>} folder ID
 */
async function getOrCreateFolder(parentId, name) {
  const safeFolderName = name;
  const cacheKey = `${parentId}::${safeFolderName}`;
  if (folderCache[cacheKey]) return folderCache[cacheKey];

  // Search for existing folder
  const safeName = escapeDriveQueryValue(safeFolderName);
  const res = await driveClient.files.list({
    q: `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  if (res.data.files.length > 0) {
    const folderId = res.data.files[0].id;
    folderCache[cacheKey] = folderId;
    console.log(`[Drive] Found folder "${safeFolderName}" → ${folderId}`);
    return folderId;
  }

  // Create folder if not found
  const folder = await driveClient.files.create({
    requestBody: {
      name: safeFolderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  folderCache[cacheKey] = folder.data.id;
  console.log(`[Drive] Created folder "${safeFolderName}" → ${folder.data.id}`);
  return folder.data.id;
}

/**
 * Upload a buffer to the InsightVault folder (or a pillar subfolder).
 * @param {Buffer} buffer - file content
 * @param {string} filename - stored filename
 * @param {string} mimetype - MIME type
 * @param {string|string[]} [folderPath] - optional subfolder name or hierarchy (e.g. ["P1 - ...", "P1.01 - ..."])
 * @returns {Promise<{id: string, url: string}>}
 */
async function upload(buffer, filename, mimetype, folderPath) {
  // Catch the common Service Account quota scenario early with a clear error.
  await ensureRootFolderIsSharedDrive();

  const parts = Array.isArray(folderPath)
    ? folderPath.filter(Boolean)
    : folderPath
      ? [folderPath]
      : [];

  const safeParts = parts.map((part) => part).filter(Boolean);

  let targetFolderId = FOLDER_ID;
  for (const part of safeParts) {
    targetFolderId = await getOrCreateFolder(targetFolderId, part);
  }

  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);

  let res;
  try {
    res = await driveClient.files.create({
      requestBody: {
        name: filename,
        parents: [targetFolderId],
      },
      media: {
        mimeType: mimetype,
        body: readable,
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    const reason = err?.errors?.[0]?.reason;
    if (reason === 'storageQuotaExceeded' || msg.includes('storage quota')) {
      const e = new Error(
        'Google Drive upload failed: Service Accounts do not have storage quota. ' +
          'Use a Shared Drive and add the Service Account email as a member, then set GOOGLE_DRIVE_FOLDER_ID to a folder inside that Shared Drive. ' +
          'Alternatively, switch to OAuth delegation.'
      );
      e.status = 403;
      throw e;
    }
    throw err;
  }

  return { id: res.data.id, url: res.data.webViewLink };
}

/**
 * Download a file from Google Drive as a Buffer.
 */
async function download(fileId) {
  const res = await driveClient.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

/**
 * Delete a file from Google Drive.
 */
async function remove(fileId) {
  await driveClient.files.delete({ fileId, supportsAllDrives: true });
}

module.exports = { init, isEnabled, upload, download, remove };
