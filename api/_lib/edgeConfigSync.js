// /api/_lib/edgeConfigSync.js — tiny helper around the Vercel Edge Config
// Read API (for the stored "last known calendar state" fingerprint) and the
// Vercel REST API (for writing the new fingerprint back).
//
// Reading only needs the EDGE_CONFIG connection string (already set on the
// project — it's a read-only token). Writing needs a separate, full Vercel
// API token in VERCEL_API_TOKEN, because Edge Config's own read token can't
// write — that token has to be created once by hand in the Vercel dashboard
// (Account Settings → Tokens) and pasted in as an env var.

const EDGE_CONFIG_ITEM_KEY = 'calendarFingerprint';

function parseConnectionString(connectionString) {
  // Format: https://edge-config.vercel.com/<id>?token=<token>
  const url = new URL(connectionString);
  const id = url.pathname.replace(/^\//, '');
  const token = url.searchParams.get('token');
  return { id, token };
}

async function readStoredFingerprint() {
  const connectionString = process.env.EDGE_CONFIG;
  if (!connectionString) {
    throw new Error('EDGE_CONFIG is not set');
  }
  const { id, token } = parseConnectionString(connectionString);

  const resp = await fetch(
    `https://edge-config.vercel.com/${id}/item/${EDGE_CONFIG_ITEM_KEY}?token=${token}`
  );

  if (resp.status === 404) {
    return null; // nothing stored yet (first run)
  }
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Edge Config read failed: ${resp.status} ${errText}`);
  }

  return resp.json();
}

async function writeStoredFingerprint(fingerprint) {
  const connectionString = process.env.EDGE_CONFIG;
  const vercelApiToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!connectionString) {
    throw new Error('EDGE_CONFIG is not set');
  }
  if (!vercelApiToken) {
    // Writing needs the account-level token described above. Not having it
    // is a known, expected state until that manual setup step is done —
    // the caller logs this clearly rather than crashing the whole run.
    throw new Error('VERCEL_API_TOKEN is not set — cannot persist the new calendar fingerprint');
  }

  const { id } = parseConnectionString(connectionString);
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';

  const resp = await fetch(`https://api.vercel.com/v1/edge-config/${id}/items${teamQuery}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${vercelApiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: [{ operation: 'upsert', key: EDGE_CONFIG_ITEM_KEY, value: fingerprint }]
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Edge Config write failed: ${resp.status} ${errText}`);
  }
}

module.exports = { readStoredFingerprint, writeStoredFingerprint };
