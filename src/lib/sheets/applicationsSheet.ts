import { JWT } from 'google-auth-library';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS_APPEND_URL = (spreadsheetId: string) =>
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
};

let cachedJwtClient: JWT | null = null;

function getServiceAccount(): ServiceAccount {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8');
    return JSON.parse(decoded) as ServiceAccount;
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error('Firebase service account credentials are not configured');
  }

  return {
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, '\n'),
  };
}

function getJwtClient(): JWT {
  if (cachedJwtClient) return cachedJwtClient;

  const serviceAccount = getServiceAccount();
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Firebase service account credentials are incomplete');
  }

  cachedJwtClient = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [SHEETS_SCOPE],
  });
  return cachedJwtClient;
}

function formatSubmitted(createdAt: Date): string {
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

export async function appendApplicationRow(app: {
  name: string;
  phone: string;
  email: string;
  city: string;
  referredBy?: string;
  status: string;
  createdAt: Date;
}): Promise<void> {
  const spreadsheetId = process.env.APPLICATIONS_SHEET_ID;
  if (!spreadsheetId) return;

  try {
    const jwtClient = getJwtClient();
    const accessToken = await jwtClient.getAccessToken();
    if (!accessToken.token) throw new Error('Google Sheets access token was not returned');

    const response = await fetch(SHEETS_APPEND_URL(spreadsheetId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[
          formatSubmitted(app.createdAt),
          app.name,
          app.phone,
          app.email,
          app.city,
          app.referredBy ?? '',
          app.status,
        ]],
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Sheets API request failed (${response.status}): ${await response.text()}`);
    }
  } catch (err) {
    console.error('applications sheet append failed', err);
  }
}
