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

/*
  Formula injection, and why the fix is a prefix rather than a different
  valueInputOption.

  The append above uses `valueInputOption=USER_ENTERED`, which is what makes
  the submitted-at column arrive as a real date the owners can sort and filter
  on rather than as seven strings. The cost of USER_ENTERED is that Sheets
  PARSES each cell exactly as if a person had typed it, so a cell that begins
  with `=`, `+`, `-`, `@`, a tab or a carriage return becomes a formula.

  `referredBy` is the reason that matters here. It reaches this row from
  `?ref=` on the public apply page, so anyone can hand an applicant a link that
  puts arbitrary text in it: `/apply?ref==HYPERLINK("http://evil.test","W2")`
  lands verbatim in the owners' sheet as a live link, and `=IMPORTXML(...)`
  would read the rows around it and send them out. Every other cell is equally
  reachable — the name, city and phone are all typed by whoever is applying.

  The fix is the standard CSV/Sheets neutralisation: prefix a single quote.
  Sheets reads a leading apostrophe as "this cell is text", shows the value
  without it, and never evaluates what follows. Switching to RAW would also
  stop the formula, but it would turn every column into a plain string and
  change the sheet the owners already have — the dates would stop being dates.
  A prefix leaves that behaviour untouched and only disarms the cells that
  would have been executed.
*/
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function sanitizeSheetCell(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value;
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
        // Every cell, not only the ones that look risky today: the guard has
        // to hold when a column is added or a value starts coming from
        // somewhere else.
        values: [[
          formatSubmitted(app.createdAt),
          app.name,
          app.phone,
          app.email,
          app.city,
          app.referredBy ?? '',
          app.status,
        ].map(sanitizeSheetCell)],
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Sheets API request failed (${response.status}): ${await response.text()}`);
    }
  } catch (err) {
    console.error('applications sheet append failed', err);
  }
}
