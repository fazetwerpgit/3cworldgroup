import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

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
  const adminConfig = {
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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

export { app, adminAuth, adminDb };

// Helper to check if Firebase Admin is properly configured
export function isFirebaseAdminConfigured(): boolean {
  return hasValidAdminConfig && app !== null;
}
