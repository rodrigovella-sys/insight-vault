// backend/microsoft/onedrive.js — Microsoft OneDrive (Microsoft Graph) integration
// Auth:
// - OAuth2 delegated permissions using refresh token
// Env:
//   - ONEDRIVE_CLIENT_ID
//   - ONEDRIVE_CLIENT_SECRET
//   - ONEDRIVE_TENANT_ID (optional; default: common)
//   - ONEDRIVE_REFRESH_TOKEN
//   - ONEDRIVE_FOLDER_ID (optional; default: root)
//   - ONEDRIVE_SCOPES (optional; default: "offline_access User.Read Files.ReadWrite.All")

const { Readable } = require('stream');

let enabled = false;
let parentFolderId = 'root';

let accessToken = null;
let accessTokenExpiresAtMs = 0;

// In-memory cache for folder IDs (avoids repeated API calls)
const folderCache = {};

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function getScopes() {
  return getEnv('ONEDRIVE_SCOPES') || 'offline_access User.Read Files.ReadWrite.All';
}

function getTenant() {
  return getEnv('ONEDRIVE_TENANT_ID') || 'common';
}

function getTokenEndpoint() {
  return `https://login.microsoftonline.com/${encodeURIComponent(getTenant())}/oauth2/v2.0/token`;
}

async function tokenFetch(form) {
  const body = new URLSearchParams(form);
  const res = await fetch(getTokenEndpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error_description || data?.error || `Token request failed (${res.status})`);
    err.status = 401;
    err.details = data;
    throw err;
  }
  return data;
}

async function getAccessToken() {
  const now = Date.now();
  if (accessToken && accessTokenExpiresAtMs - now > 60_000) return accessToken;

  const clientId = getEnv('ONEDRIVE_CLIENT_ID');
  const clientSecret = getEnv('ONEDRIVE_CLIENT_SECRET');
  const refreshToken = getEnv('ONEDRIVE_REFRESH_TOKEN');

  if (!clientId || !refreshToken) {
    const err = new Error(
      'OneDrive is not configured. Set ONEDRIVE_CLIENT_ID and ONEDRIVE_REFRESH_TOKEN (and optionally ONEDRIVE_CLIENT_SECRET for confidential clients).'
    );
    err.status = 500;
    throw err;
  }

  const form = {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: getScopes(),
  };

  // Confidential clients include a client secret; public clients do not.
  if (clientSecret) form.client_secret = clientSecret;

  const data = await tokenFetch(form);

  accessToken = data.access_token;
  const expiresInSec = Number(data.expires_in || 0);
  accessTokenExpiresAtMs = now + Math.max(0, expiresInSec) * 1000;
  return accessToken;
}

async function graphFetch(path, { method = 'GET', headers, body } = {}) {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(headers || {}),
    },
    body,
  });

  // Some endpoints (download) return 302. fetch follows redirects by default.
  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      const rawMessage = data?.error?.message || `Graph request failed (${res.status})`;
      // Friendly hint for common licensing issue.
      const message = String(rawMessage).includes('Tenant does not have a SPO license')
        ? 'OneDrive is not available for this tenant/user (missing SharePoint Online / OneDrive license). Assign a Microsoft 365/SharePoint license to the user, or disable OneDrive integration.'
        : rawMessage;
      const err = new Error(message);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || `Graph request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res;
}

async function probe() {
  // Validate that OneDrive is usable for the current user/tenant.
  // This catches cases where the tenant/user has no SharePoint Online (SPO) license.
  await graphFetch('/me/drive?$select=id,driveType');
  return true;
}

function init() {
  enabled = false;
  accessToken = null;
  accessTokenExpiresAtMs = 0;
  for (const k of Object.keys(folderCache)) delete folderCache[k];

  const clientId = getEnv('ONEDRIVE_CLIENT_ID');
  const refreshToken = getEnv('ONEDRIVE_REFRESH_TOKEN');

  if (!clientId || !refreshToken) {
    // Not configured; keep disabled.
    return false;
  }

  parentFolderId = getEnv('ONEDRIVE_FOLDER_ID') || 'root';
  enabled = true;
  return true;
}

function isEnabled() {
  return Boolean(enabled);
}

async function listChildren(parentId) {
  if (parentId === 'root') {
    const data = await graphFetch('/me/drive/root/children?$select=id,name,folder');
    return data?.value || [];
  }
  const data = await graphFetch(`/me/drive/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder`);
  return data?.value || [];
}

async function createFolder(parentId, name) {
  const payload = {
    name,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'rename',
  };

  if (parentId === 'root') {
    return graphFetch('/me/drive/root/children?$select=id,name', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  return graphFetch(`/me/drive/items/${encodeURIComponent(parentId)}/children?$select=id,name`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function createUploadSession(targetFolderId, filename) {
  const name = encodePathSegment(filename);
  const payload = {
    item: {
      '@microsoft.graph.conflictBehavior': 'replace',
      name: filename,
    },
  };

  const path = targetFolderId === 'root'
    ? `/me/drive/root:/${name}:/createUploadSession`
    : `/me/drive/items/${encodeURIComponent(targetFolderId)}:/${name}:/createUploadSession`;

  return graphFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function uploadWithSession(uploadUrl, buffer, mimetype) {
  const total = buffer.length;
  // Chunk size must be a multiple of 320 KiB.
  const chunkSize = 327_680 * 10; // 3,276,800 bytes

  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = buffer.subarray(offset, end);
    const contentRange = `bytes ${offset}-${end - 1}/${total}`;

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-length': String(chunk.length),
        'content-range': contentRange,
        'content-type': mimetype || 'application/octet-stream',
      },
      body: chunk,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (res.status === 202) {
      // Upload in progress.
      offset = end;
      continue;
    }

    if (res.ok) {
      // Final response returns the DriveItem.
      return data;
    }

    const err = new Error(data?.error?.message || `Upload session failed (${res.status})`);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  throw new Error('Upload session did not complete');
}

async function getOrCreateFolder(parentId, name) {
  const safeName = String(name || '').trim();
  if (!safeName) return parentId;

  const cacheKey = `${parentId}::${safeName}`;
  if (folderCache[cacheKey]) return folderCache[cacheKey];

  const children = await listChildren(parentId);
  const existing = children.find((c) => c?.name === safeName && c?.folder);
  if (existing?.id) {
    folderCache[cacheKey] = existing.id;
    return existing.id;
  }

  const created = await createFolder(parentId, safeName);
  const id = created?.id;
  if (!id) throw new Error('OneDrive: failed to create folder');
  folderCache[cacheKey] = id;
  return id;
}

function encodePathSegment(s) {
  // Graph uses path-based addressing. Encode but keep it readable.
  // Avoid encoding '/' since we only encode a single segment.
  return encodeURIComponent(String(s)).replace(/%2F/gi, '/');
}

async function upload(buffer, filename, mimetype, folderPath) {
  const parts = Array.isArray(folderPath)
    ? folderPath.filter(Boolean)
    : folderPath
      ? [folderPath]
      : [];

  let targetFolderId = parentFolderId;
  for (const part of parts) {
    targetFolderId = await getOrCreateFolder(targetFolderId, part);
  }

  // Simple upload is limited; use upload sessions for larger payloads.
  if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) {
    const session = await createUploadSession(targetFolderId, filename);
    const uploadUrl = session?.uploadUrl;
    if (!uploadUrl) throw new Error('OneDrive: createUploadSession did not return uploadUrl');
    const item = await uploadWithSession(uploadUrl, buffer, mimetype);
    return { id: item.id, url: item.webUrl };
  }

  const name = encodePathSegment(filename);
  const path = targetFolderId === 'root'
    ? `/me/drive/root:/${name}:/content`
    : `/me/drive/items/${encodeURIComponent(targetFolderId)}:/${name}:/content`;

  const item = await graphFetch(path, {
    method: 'PUT',
    headers: { 'content-type': mimetype || 'application/octet-stream' },
    body: buffer,
  });

  return { id: item.id, url: item.webUrl };
}

async function download(fileId) {
  const res = await graphFetch(`/me/drive/items/${encodeURIComponent(fileId)}/content`, {
    method: 'GET',
  });

  // res is a Response when content-type isn't JSON
  if (res && typeof res.arrayBuffer === 'function') {
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  // Fallback: if Graph returned JSON by some chance.
  if (res?.['@microsoft.graph.downloadUrl']) {
    const raw = await fetch(res['@microsoft.graph.downloadUrl']);
    const ab = await raw.arrayBuffer();
    return Buffer.from(ab);
  }

  throw new Error('OneDrive download failed');
}

async function remove(fileId) {
  await graphFetch(`/me/drive/items/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}

module.exports = { init, isEnabled, probe, upload, download, remove };
