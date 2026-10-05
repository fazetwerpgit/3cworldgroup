import { adminAuth, adminDb } from '@/lib/firebase/admin';

async function portalProfileFor(email: string): Promise<{ uid: string; data: FirebaseFirestore.DocumentData } | null> {
  if (!adminAuth || !adminDb) return null;

  let userRecord: { uid: string };
  try {
    userRecord = await adminAuth.getUserByEmail(email);
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    // A malformed address cannot belong to an account; the caller validates format itself.
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      return null;
    }
    throw error;
  }

  const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
  const data = userDoc.exists ? userDoc.data() : undefined;
  return data ? { uid: userRecord.uid, data } : null;
}

/**
 * Find an active portal profile for an email address.
 *
 * Firebase Auth accounts can exist without a portal profile (or while
 * onboarding is still pending), so the users document and its status are the
 * source of truth for whether this email already has portal access.
 */
export async function findActivePortalAccount(email: string): Promise<{ uid: string } | null> {
  const profile = await portalProfileFor(email);
  return profile?.data.status === 'active' ? { uid: profile.uid } : null;
}

/**
 * Find a hire midway through onboarding (pending with a field role) for an
 * email. A second invite to them can never be submitted: the public submit
 * refuses an email that is already onboarding elsewhere.
 */
export async function findOnboardingPortalAccount(
  email: string
): Promise<{ uid: string; onboardingInviteId: string | null } | null> {
  const profile = await portalProfileFor(email);
  if (profile?.data.status !== 'pending' || !profile.data.fieldRole) return null;
  const inviteId = profile.data.onboardingInviteId;
  return { uid: profile.uid, onboardingInviteId: typeof inviteId === 'string' ? inviteId : null };
}
