import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check if we have valid Firebase config
const hasValidConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Singleton pattern - prevent multiple initializations in development
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// Auth WITHOUT a popup/redirect resolver. getAuth() installs
// browserPopupRedirectResolver, and on iPhone/Safari user agents Firebase then
// loads Google's sign-in iframe chain (apis.google.com -> gapi iframes ->
// firebaseapp.com/__/auth/iframe, ~135 KB over 2 new origins) BEFORE it
// restores the saved session, so every cold open waited on it. The persistence
// list is getAuth's own (same storage, same migration), so saved sessions load
// as before. The web Google popups pass browserPopupRedirectResolver to the
// call itself (LoginForm, LinkedSignInMethods); the app signs in natively.
function createAuth(firebaseApp: FirebaseApp): Auth {
  try {
    return initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    // Already initialized (dev hot reload): reuse that instance.
    return getAuth(firebaseApp);
  }
}

// Only initialize Firebase if we have a valid config
// This allows the app to build without Firebase credentials
if (hasValidConfig) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = createAuth(app);
  db = getFirestore(app);
}

// Storage lives in ./storage so the Storage SDK loads only on the pages that
// upload or download files, not with every portal page.
export { app, auth, db };

// Helper to check if Firebase is properly configured
export function isFirebaseConfigured(): boolean {
  return hasValidConfig && app !== null;
}
