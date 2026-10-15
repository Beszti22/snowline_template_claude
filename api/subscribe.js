// /api/subscribe.js — Snowline newsletter signup, step 1 of 2 (Vercel serverless function)
// Does NOT add the contact to Resend yet. Sends a double opt-in confirmation
// email with a signed, time-limited link; the contact is only added to the
// Resend Audience once that link is clicked (see /api/confirm-subscription.js).

const { createToken } = require('./_lib/subscribeTokens');

const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const { email, consent, botcheck } = body;

  // Honeypot: real visitors never fill this hidden field. Bots usually do.
  // Silently accept without sending any email.
  if (botcheck) {
    return res.status(200).json({ ok: true });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailPattern.test(String(email)) || !consent) {
    return res.status(400).json({ ok: false, error: 'invalid_input' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !process.env.SUBSCRIBE_SECRET) {
    console.error('RESEND_API_KEY or SUBSCRIBE_SECRET is not set in the Vercel project environment variables.');
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const fromAddress = process.env.CONTACT_FROM_EMAIL || 'Snowline Website <onboarding@resend.dev>';
  const siteUrl = process.env.SITE_URL || 'https://snowline.hu';

  const confirmToken = createToken('confirm_sub', normalizedEmail, CONFIRM_TTL_MS);
  const confirmUrl = `${siteUrl}/api/confirm-subscription?token=${encodeURIComponent(confirmToken)}`;

  const html = `
    <div style="font-family:sans-serif;color:#0A1A30;max-width:480px;">
      <h2 style="color:#0A1A30;">Erősítsd meg a feliratkozást / Confirm your subscription</h2>
      <p>Szia!<br>
      Majdnem kész — kattints az alábbi gombra, hogy megerősítsd a feliratkozásod a Snowline Alpesi Síklub hírlevelére. A link 48 óráig érvényes.</p>
      <p style="margin:24px 0;">
        <a href="${confirmUrl}" style="background:#0A1A30;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Feliratkozás megerősítése</a>
      </p>
      <p style="color:#54657C;font-size:13px;">Hi! Almost done — click the button above to confirm your subscription to the Snowline Alpine Ski Club newsletter. The link is valid for 48 hours.</p>
      <p style="color:#54657C;font-size:12px;">Ha nem te kérted ezt a feliratkozást, nyugodtan hagyd figyelmen kívül ezt az e-mailt. / If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [normalizedEmail],
        subject: 'Erősítsd meg a feliratkozást / Confirm your subscription — Snowline',
        html
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Resend error (newsletter confirmation email):', resp.status, errText);
      return res.status(502).json({ ok: false, error: 'email_send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Subscribe server error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};