import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Format private key - handles various formats from environment variables
function formatPrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;

  let formattedKey = key.trim();

  // Check if it's base64 encoded (doesn't start with -----)
  if (!formattedKey.startsWith('-----') && !formattedKey.includes('BEGIN PRIVATE KEY')) {
    try {
      // Try to decode as base64
      formattedKey = Buffer.from(formattedKey, 'base64').toString('utf-8');
    } catch {
      // Not base64, continue with original
    }
  }

  // Try to parse as JSON string first (in case it was JSON.stringify'd)
  if (formattedKey.startsWith('"') && formattedKey.endsWith('"')) {
    try {
      formattedKey = JSON.parse(formattedKey);
    } catch {
      // Not valid JSON, continue with original
    }
  }

  // If the key already has actual newlines, return as-is
  if (formattedKey.includes('-----BEGIN PRIVATE KEY-----\n')) {
    return formattedKey;
  }

  // Replace escaped newlines with actual newlines
  // Handle various escape formats
  formattedKey = formattedKey
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  return formattedKey;
}

// Track initialization error for debugging
let initError: string | null = null;

// Check if we have valid admin credentials
const hasValidAdminConfig = Boolean(
  process.env.FIREBASE_ADMIN_PROJECT_ID &&
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
  process.env.FIREBASE_ADMIN_PRIVATE_KEY
);

let app: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

// Only initialize if we have valid credentials
// This allows the app to build without Firebase credentials
if (hasValidAdminConfig) {
  try {
    const formattedPrivateKey = formatPrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

    if (!formattedPrivateKey || !formattedPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      initError = 'Private key format is invalid';
      console.error('Firebase Admin: Private key format is invalid');
    } else {
      const adminConfig = {
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: formattedPrivateKey,
        }),
      };

      if (getApps().length === 0) {
        app = initializeApp(adminConfig);
      } else {
        app = getApps()[0];
      }

      adminAuth = getAuth(app);
      adminDb = getFirestore(app);
    }
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Unknown initialization error';
    console.error('Failed to initialize Firebase Admin:', error);
  }
} else {
  initError = 'Missing environment variables';
  console.error('Firebase Admin: Missing required environment variables');
}

export { app, adminAuth, adminDb, initError };

// Helper to check if Firebase Admin is properly configured
export function isFirebaseAdminConfigured(): boolean {
  return hasValidAdminConfig && app !== null;
}
