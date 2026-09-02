// Backfill all Firebase applications into the configured Google Sheet.
//   node --env-file=.env.local scripts/backfill-applications-sheet.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { JWT } from 'google-auth-library';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEET_HEADER = ['Submitted', 'Name', 'Phone', 'Email', 'City', 'Referred By', 'Status'];

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8')
      );
      return {
        projectId: parsed.project_id ?? parsed.projectId,
        clientEmail: parsed.client_email ?? parsed.clientEmail,
        privateKey: (parsed.private_key ?? parsed.privateKey)?.replace(/\\n/g, '\n'),
      };
    } catch {
      // Fall through to the individual Firebase Admin variables.
    }
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error(
      'Firebase credentials are not configured; set FIREBASE_SERVICE_ACCOUNT or the FIREBASE_ADMIN_* variables'
    );
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    clientEmail.match(/^[^@]+@([^.]+)\.iam\.gserviceaccount\.com$/)?.[1];
  if (!projectId) {
    throw new Error(
      'Unable to determine the Firebase project ID; set FIREBASE_ADMIN_PROJECT_ID or use a standard service-account email'
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

function formatSubmitted(createdAt) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Detroit',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(createdAt);
}

function appendUrl(spreadsheetId) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
}

async function requireSuccessfulResponse(response, operation) {
  if (response.ok) return response;
  const body = await response.text();
  throw new Error(`${operation} failed (${response.status}): ${body}`);
}

try {
  const spreadsheetId = process.env.APPLICATIONS_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error('APPLICATIONS_SHEET_ID is unset; configure the Google Sheet before running the backfill');
  }

  const serviceAccount = getServiceAccount();
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const jwtClient = new JWT({
    email: serviceAccount.clientEmail,
    key: serviceAccount.privateKey,
    scopes: [SHEETS_SCOPE],
  });
  const accessToken = await jwtClient.getAccessToken();
  if (!accessToken.token) throw new Error('Google Sheets access token was not returned');
  const authHeaders = { Authorization: `Bearer ${accessToken.token}` };

  const headerResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:G1`,
    { headers: authHeaders }
  );
  await requireSuccessfulResponse(headerResponse, 'Google Sheets header check');
  const headerData = await headerResponse.json();
  const values = Array.isArray(headerData.values) && headerData.values.length > 0
    ? []
    : [SHEET_HEADER];

  const snapshot = await db.collection('applications').orderBy('createdAt', 'asc').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.() ?? data.createdAt;
    if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) {
      throw new Error(`applications/${doc.id} has an invalid createdAt value`);
    }
    values.push([
      formatSubmitted(createdAt),
      data.name ?? '',
      data.phone ?? '',
      data.email ?? '',
      data.city ?? '',
      data.referredBy ?? '',
      data.status ?? '',
    ]);
  }

  const response = await fetch(appendUrl(spreadsheetId), {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  await requireSuccessfulResponse(response, 'Google Sheets append');
  console.log(`Appended ${snapshot.size} application row(s) to the sheet.`);
} catch (error) {
  console.error(`Applications sheet backfill failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
