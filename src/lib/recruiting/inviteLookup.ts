import { adminDb } from '@/lib/firebase/admin';
import { hashInviteToken } from './tokens';

/** Finds the onboardingInvites doc a raw invite token belongs to (stored by hash). */
export async function getInviteByToken(token: string) {
  if (!adminDb) return null;
  const tokenHash = hashInviteToken(token);
  const snapshot = await adminDb
    .collection('onboardingInvites')
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ref: doc.ref, data: doc.data() };
}

export function isInviteExpired(expiresAt: FirebaseFirestore.Timestamp | undefined) {
  return !!expiresAt?.toDate && expiresAt.toDate().getTime() < Date.now();
}

/** Packet already sent: the public POST created the hire's portal account. */
export const SUBMITTED_INVITE_STATUSES = ['submitted', 'approved', 'converted'];

/**
 * Where a hire holding this invite stands, coarse enough to hand the client:
 * 'open' means the packet can still be filled in at /onboard/<token>;
 * 'submitted' means it was sent and the hire signs in with the password they
 * set there. Expired, rejected or otherwise closed invites give null.
 */
export function inviteSignupState(data: {
  status?: unknown;
  expiresAt?: FirebaseFirestore.Timestamp;
}): 'open' | 'submitted' | null {
  if (data.status === 'expired' || isInviteExpired(data.expiresAt)) return null;
  if (data.status === 'invited' || data.status === 'in_progress') return 'open';
  if (typeof data.status === 'string' && SUBMITTED_INVITE_STATUSES.includes(data.status)) return 'submitted';
  return null;
}
