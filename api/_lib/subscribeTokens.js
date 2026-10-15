// /api/_lib/subscribeTokens.js — signed, stateless tokens for the newsletter
// double opt-in and unsubscribe flow. No database: the token itself carries
// the email, a purpose tag (so a confirm-link can't be replayed as an
// unsubscribe-link) and an expiry, authenticated with an HMAC so it can't be
// forged or tampered with. Requires SUBSCRIBE_SECRET in the Vercel env.

const crypto = require('crypto');

function sign(payloadB64) {
  const secret = process.env.SUBSCRIBE_SECRET;
  if (!secret) throw new Error('SUBSCRIBE_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function createToken(purpose, email, ttlMs) {
  const payload = JSON.stringify({ p: purpose, e: email, x: Date.now() + ttlMs });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

function verifyToken(purpose, token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  let expectedSig;
  try {
    expectedSig = sign(payloadB64);
  } catch (e) {
    return null;
  }

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }

  if (data.p !== purpose) return null;
  if (!data.x || Date.now() > data.x) return null;
  if (!data.e || typeof data.e !== 'string') return null;

  return { email: data.e };
}

module.exports = { createToken, verifyToken };