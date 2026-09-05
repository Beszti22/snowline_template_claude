// /api/contact.js — Snowline contact form handler (Vercel serverless function)
// Sends inquiry emails via Resend (https://resend.com). Requires the RESEND_API_KEY
// environment variable to be set in the Vercel project settings.

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

  const {
    parentName, athleteName, athleteAge, experienceLevel,
    email, phone, program, message, consent, botcheck
  } = body;

  // Honeypot: real visitors never fill this hidden field. Bots usually do.
  // Silently accept without sending any email.
  if (botcheck) {
    return res.status(200).json({ ok: true });
  }

  // Server-side validation (mirrors the HTML5 "required" attributes on the form,
  // but must be re-checked here since anyone can POST to this endpoint directly).
  if (!parentName || !athleteName || !athleteAge || !email || !consent) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(String(email))) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set in the Vercel project environment variables.');
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  const toAddress = process.env.CONTACT_TO_EMAIL || 'snowline.web@gmail.com';
  // Resend's shared sandbox sender works immediately with no domain setup.
  // Once a sending domain (e.g. no-reply@snowline.hu) is verified in Resend,
  // set CONTACT_FROM_EMAIL in Vercel to switch over — no code change needed.
  const fromAddress = process.env.CONTACT_FROM_EMAIL || 'Snowline Website <onboarding@resend.dev>';

  const notifyHtml = `
    <h2 style="font-family:sans-serif;color:#0A1A30;">New inquiry from snowline.hu</h2>
    <table style="font-family:sans-serif;font-size:14px;color:#0A1A30;border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Parent / guardian</td><td>${escapeHtml(parentName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Athlete's name</td><td>${escapeHtml(athleteName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Athlete age</td><td>${escapeHtml(athleteAge)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Experience level</td><td>${escapeHtml(experienceLevel || '-')}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Program of interest</td><td>${escapeHtml(program || '-')}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Email</td><td>${escapeHtml(email)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Phone</td><td>${escapeHtml(phone || '-')}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:14px;color:#0A1A30;"><b>Message:</b><br>${escapeHtml(message || '-').replace(/\n/g, '<br>')}</p>
    <p style="font-family:sans-serif;font-size:12px;color:#54657C;">Sent from the contact form at snowline.hu. Reply directly to this email to reach the parent.</p>
  `;

  const confirmationHtml = `
    <div style="font-family:sans-serif;color:#0A1A30;">
      <h2 style="color:#0A1A30;">Köszönjük a megkeresésed! / Thanks for reaching out!</h2>
      <p>Kedves ${escapeHtml(parentName)}!<br>
      Megkaptuk az üzeneted a(z) <b>${escapeHtml(athleteName)}</b> nevű sportolóval kapcsolatban. Hamarosan, de legkésőbb 2 munkanapon belül válaszolunk.</p>
      <p style="color:#54657C;font-size:13px;">Dear ${escapeHtml(parentName)}, we've received your inquiry about ${escapeHtml(athleteName)}. We'll get back to you within 2 business days.</p>
      <p style="font-size:13px;color:#54657C;">— Snowline Alpine Ski Club<br>snowline.hu</p>
    </div>
  `;

  try {
    const notifyResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toAddress],
        reply_to: email,
        subject: `New inquiry: ${athleteName} (${program || 'general'})`,
        html: notifyHtml
      })
    });

    if (!notifyResp.ok) {
      const errText = await notifyResp.text();
      console.error('Resend error (club notification):', notifyResp.status, errText);
      return res.status(502).json({ ok: false, error: 'email_send_failed' });
    }

    // Best-effort auto-reply to the parent. If this fails, the club still got
    // the inquiry above, so we don't fail the whole request over it.
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [email],
          subject: 'Megkaptuk a megkeresésed / We received your inquiry — Snowline Alpine Ski Club',
          html: confirmationHtml
        })
      });
    } catch (confirmErr) {
      console.error('Resend error (parent confirmation, non-fatal):', confirmErr);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form server error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
