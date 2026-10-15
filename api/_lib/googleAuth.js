// /api/_lib/googleAuth.js — minimal Google service-account OAuth2 (JWT-bearer,
// RFC 7523), hand-rolled with Node's built-in crypto so the project doesn't
// need the googleapis / google-auth-library npm packages.
//
// Requires GOOGLE_SERVICE_ACCOUNT_KEY in the Vercel env: the full JSON key
// file content for the service account (the one that already has access to
// the club's Google Calendar), as a single-line string.

const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getGoogleAccessToken(scope) {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  }

  let key;
  try {
    key = JSON.parse(rawKey);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: key.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign(key.private_key)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${signingInput}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google OAuth token request failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  return data.access_token;
}

module.exports = { getGoogleAccessToken };
