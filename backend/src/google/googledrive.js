// backend/google/googledrive.js — Google Drive integration for Insight Vault v3.0
// Auth:
// - OAuth2 via GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET/GOOGLE_OAUTH_REFRESH_TOKEN
// Supports automatic subfolder creation per pillar/topic

const { google } = require('googleapis');
const { Readable } = require('stream');

let driveClient = null;
let oauthClient = null;
let FOLDER_ID = null;

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
  oauthClient = null;
  for (const k of Object.keys(folderCache)) delete folderCache[k];

  FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!FOLDER_ID) {
    console.warn('✗ disabled — GOOGLE_DRIVE_FOLDER_ID not set. Set it to enable Google Drive integration.');
    return false;
  } else {
    console.warn(`✓ enabled (Google Drive Folder) ID: ${FOLDER_ID}`);
  }

  // OAuth2 (recommended)
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn(
      '✗ disabled — missing Google OAuth2 env vars. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN to enable Google Drive integration.'
    );
    return false;
  }

  try {
    oauthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauthClient.setCredentials({ refresh_token: refreshToken });
    driveClient = google.drive({ version: 'v3', auth: oauthClient });
    console.warn('✓ enabled (OAuth2) Google Drive client initialized');
    return true;
  } catch (err) {
    console.error('✗ disabled — OAuth2 init error:', err.message);
    return false;
  }
}

function isEnabled() {
  return driveClient !== null;
}

/**
 * Validate that Google Drive is usable with the current credentials.
 * Throws an Error if the configured folder cannot be accessed.
 */
async function probe() {
  if (!driveClient) {
    throw new Error('Google Drive is not initialized');
  }
  if (!FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set');
  }

  try {
    // Check folder exists and is accessible.
    await driveClient.files.get({
      fileId: FOLDER_ID,
      fields: 'id',
      supportsAllDrives: true,
    });
  } catch (err) {
    const msg = err?.message || 'probe failed';
    throw new Error(`Google Drive probe failed: ${msg}`);
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

  const res = await driveClient.files.create({
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

module.exports = { init, isEnabled, probe, upload, download, remove };
