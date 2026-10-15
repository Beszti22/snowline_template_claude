// /api/calendar-notify.js — runs once a day via Vercel Cron (see vercel.json).
// Checks whether the club's Google Calendar changed since the last check,
// and if so, emails the newsletter audience a generic "the schedule changed"
// notice with a link to the schedule page (no detailed diff — by design).
//
// No database: "did anything change" is answered by hashing a fingerprint of
// the upcoming events (id + status + last-updated timestamp for each) and
// comparing it to the fingerprint stored from the previous run in Vercel
// Edge Config.

const crypto = require('crypto');
const { getGoogleAccessToken } = require('./_lib/googleAuth');
const { readStoredFingerprint, writeStoredFingerprint } = require('./_lib/edgeConfigSync');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'snowline.web@gmail.com';
const MAX_EVENTS = 250; // upcoming events considered per run; plenty for a club calendar

function buildFingerprint(events) {
  const relevant = events
    .map((e) => `${e.id}:${e.status}:${e.updated}`)
    .sort();
  return crypto.createHash('sha256').update(relevant.join('|')).digest('hex');
}

async function fetchUpcomingEvents(accessToken) {
  const timeMin = new Date().toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events` +
    `?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&maxResults=${MAX_EVENTS}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google Calendar events.list failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  return data.items || [];
}

async function sendChangeNotification() {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const fromAddress = process.env.CONTACT_FROM_EMAIL || 'Snowline Website <onboarding@resend.dev>';
  const siteUrl = process.env.SITE_URL || 'https://snowline.hu';
  const scheduleUrl = `${siteUrl}/schedule.html`;

  if (!apiKey || !audienceId) {
    throw new Error('RESEND_API_KEY or RESEND_AUDIENCE_ID is not set');
  }

  const html = `
    <div style="font-family:sans-serif;color:#0A1A30;max-width:480px;">
      <h2 style="color:#0A1A30;">Változott az edzés-/versenynaptár / The training &amp; race schedule changed</h2>
      <p>Szia!<br>
      Frissült a Snowline Alpesi Síklub naptára — érdemes egy pillantást vetni rá, hogy lásd, mi változott.</p>
      <p style="margin:24px 0;">
        <a href="${scheduleUrl}" style="background:#0A1A30;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Naptár megnyitása</a>
      </p>
      <p style="color:#54657C;font-size:13px;">Hi! The Snowline Alpine Ski Club schedule was just updated — worth a quick look to see what changed.</p>
    </div>
  `;

  // Resend's "email an entire Audience" primitive is a Broadcast, not the
  // plain transactional /emails endpoint (that one needs an explicit
  // recipient list, not an audience reference).
  const createResp = await fetch('https://api.resend.com/broadcasts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      audienceId,
      from: fromAddress,
      subject: 'Változott a naptár / The schedule changed — Snowline',
      html
    })
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Resend broadcast create failed: ${createResp.status} ${errText}`);
  }

  const broadcast = await createResp.json();

  const sendResp = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!sendResp.ok) {
    const errText = await sendResp.text();
    throw new Error(`Resend broadcast send failed: ${sendResp.status} ${errText}`);
  }
}

module.exports = async (req, res) => {
  // Vercel Cron automatically sends this as a Bearer token on scheduled
  // invocations — checking it keeps the endpoint from being triggered by
  // anyone who finds the URL.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/calendar.readonly');
    const events = await fetchUpcomingEvents(accessToken);
    const fingerprint = buildFingerprint(events);

    const previousFingerprint = await readStoredFingerprint();

    if (previousFingerprint === null) {
      // First run ever (or Edge Config was cleared): just establish a
      // baseline, don't email — there's nothing to compare against yet.
      await writeStoredFingerprint(fingerprint);
      return res.status(200).json({ ok: true, changed: false, firstRun: true });
    }

    if (previousFingerprint === fingerprint) {
      return res.status(200).json({ ok: true, changed: false });
    }

    await sendChangeNotification();
    await writeStoredFingerprint(fingerprint);
    return res.status(200).json({ ok: true, changed: true, notified: true });
  } catch (err) {
    console.error('calendar-notify error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
