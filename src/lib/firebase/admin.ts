import { initializeApp, getApps, cert, App, ServiceAccount } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Track initialization error for debugging
let initError: string | null = null;

let app: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

// Try to get service account from FIREBASE_SERVICE_ACCOUNT (base64 encoded JSON)
// or fall back to individual environment variables
function getServiceAccount(): ServiceAccount | null {
  // Option 1: Full service account JSON (base64 encoded)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decoded) as ServiceAccount;
      return serviceAccount;
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
    }
  }

  // Option 2: Individual environment variables
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  // Format the private key
  let formattedKey = privateKey;

  // Try base64 decode first
  if (!formattedKey.includes('-----BEGIN')) {
    try {
      formattedKey = Buffer.from(formattedKey, 'base64').toString('utf-8');
    } catch {
      // Not base64
    }
  }

  // Replace escaped newlines
  formattedKey = formattedKey
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n');

  return {
    projectId,
    clientEmail,
    privateKey: formattedKey,
  } as ServiceAccount;
}

// Initialize Firebase Admin
const serviceAccount = getServiceAccount();

if (serviceAccount) {
  try {
    if (getApps().length === 0) {
      app = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      app = getApps()[0];
    }

    adminAuth = getAuth(app);
    adminDb = getFirestore(app);
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Unknown initialization error';
    console.error('Failed to initialize Firebase Admin:', error);
  }
} else {
  initError = 'Missing Firebase credentials';
  console.error('Firebase Admin: No valid credentials found');
}

export { app, adminAuth, adminDb, initError };

// Helper to check if Firebase Admin is properly configured
export function isFirebaseAdminConfigured(): boolean {
  return app !== null && adminDb !== null;
}
