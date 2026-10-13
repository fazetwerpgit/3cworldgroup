import { JWT } from 'google-auth-library';
import { WEBMASTERS_READONLY_SCOPE } from './searchConsole';

// An access token for Search Console, from the same Firebase service account
// the rest of the server uses (FIREBASE_SERVICE_ACCOUNT). google-auth-library
// is already in the tree through firebase-admin, and lib/sheets signs in the
// same way.

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/**
 * FIREBASE_SERVICE_ACCOUNT as raw JSON or base64-encoded JSON (lib/firebase/admin
 * reads the base64 form). Null when it is missing or unreadable.
 */
export function parseServiceAccount(raw: string | undefined): ServiceAccountKey | null {
  const text = raw?.trim();
  if (!text) return null;
  const candidates = text.startsWith('{') ? [text] : [Buffer.from(text, 'base64').toString('utf-8'), text];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<ServiceAccountKey>;
      if (typeof parsed.client_email === 'string' && typeof parsed.private_key === 'string') {
        return { client_email: parsed.client_email, private_key: parsed.private_key };
      }
    } catch {
      // Try the next reading.
    }
  }
  return null;
}

function serviceAccountFromEnv(): ServiceAccountKey {
  const parsed = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (parsed) return parsed;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (clientEmail && privateKey) return { client_email: clientEmail, private_key: privateKey.replace(/\\n/g, '\n') };
  throw new Error('Firebase service account credentials are not configured');
}

let client: JWT | null = null;

/** A webmasters.readonly access token; google-auth-library caches and refreshes it. */
export async function getSearchConsoleToken(): Promise<string> {
  if (!client) {
    const account = serviceAccountFromEnv();
    client = new JWT({ email: account.client_email, key: account.private_key, scopes: [WEBMASTERS_READONLY_SCOPE] });
  }
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Search Console access token was not returned');
  return token;
}
