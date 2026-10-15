// /api/unsubscribe.js — one-click unsubscribe from the Snowline newsletter.
// GET endpoint (it's a link, not a form submission). Verifies the signed
// token and marks the contact unsubscribed in the Resend Audience.

const { verifyToken } = require('./_lib/subscribeTokens');

module.exports = async (req, res) => {
  const token = req.query && req.query.token;
  const result = verifyToken('unsub', token);

  if (!result) {
    res.writeHead(302, { Location: '/leiratkozva.html?status=error' });
    return res.end();
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) {
    console.error('RESEND_API_KEY or RESEND_AUDIENCE_ID is not set in the Vercel project environment variables.');
    res.writeHead(302, { Location: '/leiratkozva.html?status=error' });
    return res.end();
  }

  try {
    const resp = await fetch(
      `https://api.resend.com/audiences/${audienceId}/contacts/${encodeURIComponent(result.email)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ unsubscribed: true })
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Resend error (unsubscribe):', resp.status, errText);
      res.writeHead(302, { Location: '/leiratkozva.html?status=error' });
      return res.end();
    }

    res.writeHead(302, { Location: '/leiratkozva.html?status=ok' });
    return res.end();
  } catch (err) {
    console.error('Unsubscribe server error:', err);
    res.writeHead(302, { Location: '/leiratkozva.html?status=error' });
    return res.end();
  }
};