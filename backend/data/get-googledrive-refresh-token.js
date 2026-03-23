// backend/data/get-googledrive-refresh-token.js
// One-off helper to obtain a Google OAuth2 refresh token for Google Drive.
// Usage:
//   1) Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in backend/.env.local
//   2) (Optional) Set GOOGLE_OAUTH_REDIRECT_URI, GOOGLE_OAUTH_AUTH_PORT, GOOGLE_OAUTH_SCOPES
//   3) Run: node data/get-googledrive-refresh-token.js
//   4) Open the printed URL, login, consent, then copy the refresh token.
//
// Notes:
// - To ensure a refresh token is returned: access_type=offline + prompt=consent.
// - If your OAuth Consent Screen is in "Testing", refresh tokens can expire (commonly ~7 days).

const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load env like server.js does
for (const envPath of [
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env.development'),
  path.join(__dirname, '..', '.env'),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID');
const clientSecret = getEnv('GOOGLE_OAUTH_CLIENT_SECRET');
const port = Number(getEnv('GOOGLE_OAUTH_AUTH_PORT') || 3006);

// Keep scopes explicit; default to full Drive access so the app can access an existing folder ID.
// If you want least privilege, consider narrowing later, but make sure it still works with your folder.
const scopes = getEnv('GOOGLE_OAUTH_SCOPES') || 'https://www.googleapis.com/auth/drive';

// IMPORTANT: this redirect URI MUST be added to your OAuth Client's
// "Authorized redirect URIs" in Google Cloud Console, otherwise you'll get
// Error 400: redirect_uri_mismatch.
const redirectUri = getEnv('GOOGLE_OAUTH_REDIRECT_URI') || `http://localhost:${port}/auth/google/callback`;

if (!clientId || !clientSecret) {
  console.error('Missing env. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in backend/.env.local');
  process.exit(1);
}

const app = express();

app.get('/auth/google', (req, res) => {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');

  res.redirect(authUrl.toString());
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code) {
      res.status(400).send('Missing code');
      return;
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

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
      res
        .status(500)
        .send(
          'No refresh_token returned. Ensure access_type=offline and prompt=consent. ' +
            'Also note: Google may not return a new refresh token if the user already consented recently.'
        );
      return;
    }

    // Print to terminal.
    console.log('\n=== Google Drive refresh token ===');
    console.log(refreshToken);
    console.log('=================================\n');
    console.log('Set this in Render as GOOGLE_OAUTH_REFRESH_TOKEN (and keep GOOGLE_OAUTH_CLIENT_ID/SECRET consistent).');

    res.send('Refresh token printed to terminal. You can close this tab.');
    process.nextTick(() => process.exit(0));
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.listen(port, () => {
  console.log(`[Google OAuth] listening on http://localhost:${port}`);
  console.log(`[Google OAuth] open: http://localhost:${port}/auth/google`);
  console.log(`Redirect URI configured: ${redirectUri}`);
  console.log(`[Google OAuth] add this exact Redirect URI in Google Cloud Console: ${redirectUri}`);
  console.log(`Scopes: ${scopes}`);
});
