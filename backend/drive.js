// backend/drive.js — Google Drive integration for Insight Vault v3.0
// Uses OAuth2 credentials (Client ID + Secret + Refresh Token)
// Supports automatic subfolder creation per pillar

const { google } = require('googleapis');
const { Readable } = require('stream');

let driveClient = null;
let FOLDER_ID   = null;

// In-memory cache for folder IDs (avoids repeated API calls)
const folderCache = {};

/**
 * Initialize Drive client using OAuth2.
 * Reads GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 * and GOOGLE_DRIVE_FOLDER_ID from env.
 * Returns true if initialization succeeded.
 */
function init() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  FOLDER_ID          = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientId || !clientSecret || !refreshToken || !FOLDER_ID) {
    console.warn('[Drive] Missing env vars — Drive disabled.');
    return false;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    console.log('[Drive] OAuth2 client initialized');
    return true;
  } catch (err) {
    console.error('[Drive] Init error:', err.message);
    return false;
  }
}

function isEnabled() {
  return driveClient !== null;
}

/**
 * Get or create a subfolder inside a parent folder.
 * Uses in-memory cache to avoid repeated API calls.
 * @returns {Promise<string>} folder ID
 */
async function getOrCreateFolder(parentId, name) {
  const cacheKey = `${parentId}::${name}`;
  if (folderCache[cacheKey]) return folderCache[cacheKey];

  // Search for existing folder
  const res = await driveClient.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files.length > 0) {
    const folderId = res.data.files[0].id;
    folderCache[cacheKey] = folderId;
    console.log(`[Drive] Found folder "${name}" → ${folderId}`);
    return folderId;
  }

  // Create folder if not found
  const folder = await driveClient.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  folderCache[cacheKey] = folder.data.id;
  console.log(`[Drive] Created folder "${name}" → ${folder.data.id}`);
  return folder.data.id;
}

/**
 * Upload a buffer to the InsightVault folder (or a pillar subfolder).
 * @param {Buffer} buffer - file content
 * @param {string} filename - stored filename
 * @param {string} mimetype - MIME type
 * @param {string} [pillarFolder] - optional subfolder name (e.g. "P1 - Desenvolvimento Pessoal & Eficácia")
 * @returns {Promise<{id: string, url: string}>}
 */
async function upload(buffer, filename, mimetype, pillarFolder) {
  const targetFolderId = pillarFolder
    ? await getOrCreateFolder(FOLDER_ID, pillarFolder)
    : FOLDER_ID;

  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);

  const res = await driveClient.files.create({
    requestBody: {
      name:    filename,
      parents: [targetFolderId],
    },
    media: {
      mimeType: mimetype,
      body:     readable,
    },
    fields: 'id, webViewLink',
  });

  return { id: res.data.id, url: res.data.webViewLink };
}

/**
 * Download a file from Google Drive as a Buffer.
 */
async function download(fileId) {
  const res = await driveClient.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

/**
 * Delete a file from Google Drive.
 */
async function remove(fileId) {
  await driveClient.files.delete({ fileId });
}

module.exports = { init, isEnabled, upload, download, remove };
