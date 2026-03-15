// backend/drive.js — Google Drive integration for Insight Vault v3.0
// Uses OAuth2 credentials (Client ID + Secret + Refresh Token)

const { google } = require('googleapis');
const { Readable } = require('stream');

let driveClient = null;
let FOLDER_ID   = null;

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
 * Upload a buffer to the InsightVault folder in Google Drive.
 * @returns {Promise<{id: string, url: string}>}
 */
async function upload(buffer, filename, mimetype) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);

  const res = await driveClient.files.create({
    requestBody: {
      name:    filename,
      parents: [FOLDER_ID],
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
