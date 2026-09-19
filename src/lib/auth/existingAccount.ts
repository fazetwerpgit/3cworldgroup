import { adminAuth, adminDb } from '@/lib/firebase/admin';

/**
 * Find an active portal profile for an email address.
 *
 * Firebase Auth accounts can exist without a portal profile (or while
 * onboarding is still pending), so the users document and its status are the
 * source of truth for whether this email already has portal access.
 */
export async function findActivePortalAccount(email: string): Promise<{ uid: string } | null> {
  if (!adminAuth || !adminDb) return null;

  let userRecord: { uid: string };
  try {
    userRecord = await adminAuth.getUserByEmail(email);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'auth/user-not-found'
    ) {
      return null;
    }
    throw error;
  }

  const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
  if (!userDoc.exists || userDoc.data()?.status !== 'active') return null;

  return { uid: userRecord.uid };
}
