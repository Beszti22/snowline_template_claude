// /api/confirm-subscription.js — step 2 of 2: completes the Snowline
// newsletter double opt-in. Verifies the signed token from the confirmation
// email, adds the contact to the Resend Audience, then redirects to a
// confirmation page. GET endpoint (it's a link clicked from an email).

const { verifyToken, createToken } = require('./_lib/subscribeTokens');

const UNSUB_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

module.exports = async (req, res) => {
  const token = req.query && req.query.token;
  const result = verifyToken('confirm_sub', token);

  if (!result) {
    res.writeHead(302, { Location: '/feliratkozas-megerositve.html?status=error' });
    return res.end();
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) {
    console.error('RESEND_API_KEY or RESEND_AUDIENCE_ID is not set in the Vercel project environment variables.');
    res.writeHead(302, { Location: '/feliratkozas-megerositve.html?status=error' });
    return res.end();
  }

  try {
    const resp = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: result.email, unsubscribed: false })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Resend error (add contact to audience):', resp.status, errText);
      res.writeHead(302, { Location: '/feliratkozas-megerositve.html?status=error' });
      return res.end();
    }

    // Hand out a long-lived unsubscribe link only now that the address is confirmed.
    const unsubToken = createToken('unsub', result.email, UNSUB_TTL_MS);
    res.writeHead(302, {
      Location: `/feliratkozas-megerositve.html?status=ok&u=${encodeURIComponent(unsubToken)}`
    });
    return res.end();
  } catch (err) {
    console.error('Confirm-subscription server error:', err);
    res.writeHead(302, { Location: '/feliratkozas-megerositve.html?status=error' });
    return res.end();
  }
};