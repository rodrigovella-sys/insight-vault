// backend/data/get-onedrive-refresh-token.js
// One-off helper to obtain a Microsoft OAuth2 refresh token for OneDrive (Graph).
// Usage:
//   1) Set ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET in backend/.env.local
//   2) (Optional) Set ONEDRIVE_TENANT_ID and ONEDRIVE_REDIRECT_URI
//   3) Run: node data/get-onedrive-refresh-token.js
//   4) Open the printed URL, login, consent, then copy the refresh token.

const crypto = require('crypto');
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load env like server.js does
for (const envPath of [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env.development'), path.join(__dirname, '..', '.env')]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function base64Url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Base64Url(str) {
  return base64Url(crypto.createHash('sha256').update(str).digest());
}

const clientId = getEnv('ONEDRIVE_CLIENT_ID');
const clientSecret = getEnv('ONEDRIVE_CLIENT_SECRET');
const tenant = getEnv('ONEDRIVE_TENANT_ID') || 'common';
const port = Number(getEnv('ONEDRIVE_AUTH_PORT') || 3005);
const redirectUri = getEnv('ONEDRIVE_REDIRECT_URI') || `http://localhost:${port}/auth/microsoft/callback`;
const scopes = getEnv('ONEDRIVE_SCOPES') || 'offline_access User.Read Files.ReadWrite.All';

if (!clientId) {
  console.error('Missing env. Set ONEDRIVE_CLIENT_ID in backend/.env.local');
  process.exit(1);
}

const app = express();

let pkceVerifier = null;

app.get('/auth/microsoft', (req, res) => {
  pkceVerifier = base64Url(crypto.randomBytes(32));
  const challenge = sha256Base64Url(pkceVerifier);

  const authUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  res.redirect(authUrl.toString());
});

app.get('/auth/microsoft/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code) {
      res.status(400).send('Missing code');
      return;
    }
    if (!pkceVerifier) {
      res.status(400).send('Missing PKCE verifier (restart and try again)');
      return;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
    const params = {
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: pkceVerifier,
      scope: scopes,
    };
    if (clientSecret) params.client_secret = clientSecret;

    const body = new URLSearchParams(params);

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await tokenRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!tokenRes.ok) {
      res.status(500).send(`Token exchange failed: ${data?.error_description || data?.error || tokenRes.status}`);
      return;
    }

    const refreshToken = data.refresh_token;
    if (!refreshToken) {
      res.status(500).send('No refresh_token returned. Ensure scope includes offline_access and prompt=consent.');
      return;
    }

    // Print to terminal.
    console.log('\n=== OneDrive refresh token ===');
    console.log(refreshToken);
    console.log('=============================\n');
    console.log('Set this in backend/.env.local as ONEDRIVE_REFRESH_TOKEN');

    res.send('Refresh token printed to terminal. You can close this tab.');
    process.nextTick(() => process.exit(0));
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.listen(port, () => {
  console.log(`[OneDrive OAuth] listening on http://localhost:${port}`);
  console.log(`[OneDrive OAuth] open: http://localhost:${port}/auth/microsoft`);
  console.log(`Redirect URI configured: ${redirectUri}`);
});
