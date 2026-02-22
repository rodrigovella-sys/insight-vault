// backend/drive.js — Google Drive integration for Insight Vault v3.0
// Uses Service Account credentials (JSON key stored as env var)

const { google } = require('googleapis');
const { Readable } = require('stream');

let driveClient = null;
let FOLDER_ID   = null;

/**
 * Initialize Drive client.
 * Reads GOOGLE_SERVICE_ACCOUNT_KEY (JSON string) and GOOGLE_DRIVE_FOLDER_ID from env.
 * Returns true if initialization succeeded.
 */
function init() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  FOLDER_ID     = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!keyJson || !FOLDER_ID) {
    return false;
  }

  try {
    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = google.drive({ version: 'v3', auth });
    console.log('[Drive] Service account:', credentials.client_email);
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
 * Uses the original filename and shares the file with the vault owner.
 * @returns {Promise<{id: string, url: string}>}
 */
async function upload(buffer, originalName, mimetype) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);

  const res = await driveClient.files.create({
    requestBody: {
      name:    originalName,
      parents: [FOLDER_ID],
    },
    media: {
      mimeType: mimetype,
      body:     readable,
    },
    fields: 'id, webViewLink',
  });

  const fileId = res.data.id;

  // Share file with vault owner so they can open it directly
  const ownerEmail = process.env.GOOGLE_DRIVE_OWNER_EMAIL;
  if (ownerEmail) {
    try {
      await driveClient.permissions.create({
        fileId,
        requestBody: { type: 'user', role: 'writer', emailAddress: ownerEmail },
      });
    } catch (err) {
      console.warn('[Drive] Could not share file with owner:', err.message);
    }
  }

  return { id: fileId, url: res.data.webViewLink };
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
