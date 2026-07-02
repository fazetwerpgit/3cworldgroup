'use client';

import { auth } from '@/lib/firebase/config';

/**
 * Resolve a fresh Firebase ID token, waiting for auth to finish restoring the
 * session if needed — grabbing auth.currentUser too early races on first load.
 */
export async function getIdToken(): Promise<string | null> {
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser.getIdToken();
  return new Promise((resolve) => {
    const unsubscribe = auth!.onAuthStateChanged((firebaseUser) => {
      unsubscribe();
      resolve(firebaseUser ? firebaseUser.getIdToken() : null);
    });
  });
}
