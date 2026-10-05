import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/firebase/admin';
import { getInviteByToken, SUBMITTED_INVITE_STATUSES } from '@/lib/recruiting/inviteLookup';
import { isEsignItem } from '@/lib/onboarding/esign';
import { getOnboardingItemsForUser, type OnboardingItem } from '@/types/onboarding';
import { roleRequiresOnboarding, type FieldRole } from '@/types/auth';

/**
 * The invite link's sign-all step.
 *
 * The invite token alone is not enough to sign: it sits in an email and can be
 * forwarded, and the documents carry the hire's name and address. So the POST
 * that submits the packet (and sets the password) also mints a signing key,
 * returned once in its response and stored here only as a hash. The step's
 * routes need both the token and that key, and the key is good only while:
 *
 * - the invite is submitted and still points at the account it created;
 * - that account is still `pending`, was created by THIS invite, and has the
 *   invite's email (so a later invite or a status change ends it);
 * - it has not expired, and not every document is signed yet.
 *
 * The key is never reissued: the POST refuses a submitted invite, so nobody
 * holding the link later can mint one. A hire who leaves signs in the portal.
 */

export const SIGNING_KEY_HEADER = 'x-onboard-signing-key';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_KEY_LENGTH = 128;

export interface InviteSigningSessionRecord {
  keyHash: string;
  userId: string;
  expiresAt: Date;
  closedAt?: Date;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date } | null | undefined;
  return typeof maybe?.toDate === 'function' ? maybe.toDate() : undefined;
}

/** A fresh key for the hire's browser, and the record that goes on the invite. */
export function issueSigningSession(userId: string, now = new Date()) {
  const key = randomBytes(32).toString('base64url');
  const record: InviteSigningSessionRecord = {
    keyHash: hashKey(key),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  };
  return { key, record };
}

export type InviteSigningAuth =
  | {
      ok: true;
      userId: string;
      inviteRef: FirebaseFirestore.DocumentReference;
      user: FirebaseFirestore.DocumentData;
      items: OnboardingItem[];
    }
  | { ok: false; status: number; error: string; done?: boolean };

/** The e-sign items on this hire's checklist, in checklist order. */
export function esignItemsFor(user: FirebaseFirestore.DocumentData): OnboardingItem[] {
  const fieldRole = user.fieldRole as FieldRole | undefined;
  if (!fieldRole || !roleRequiresOnboarding(fieldRole)) return [];
  return getOnboardingItemsForUser(fieldRole, !!user.isIBO).filter((item) => isEsignItem(item.id));
}

/**
 * Checks a token + key pair. Every failure that is not "you are done" reads
 * the same to the client (401/403/404 by kind, never which check failed), so
 * the route cannot be used to probe accounts.
 */
export async function authorizeInviteSigning(
  token: string,
  key: string | null,
  now = new Date()
): Promise<InviteSigningAuth> {
  if (!adminDb) return { ok: false, status: 503, error: 'unavailable' };
  if (!key || key.length > MAX_KEY_LENGTH) return { ok: false, status: 401, error: 'signing session required' };

  const invite = await getInviteByToken(token);
  if (!invite) return { ok: false, status: 404, error: 'Invite not found' };

  const session = invite.data.esignSession as Partial<InviteSigningSessionRecord> | undefined;
  const userId = typeof invite.data.convertedUserId === 'string' ? invite.data.convertedUserId : '';
  if (
    !session ||
    typeof session.keyHash !== 'string' ||
    !sameHash(session.keyHash, hashKey(key)) ||
    !userId ||
    session.userId !== userId
  ) {
    return { ok: false, status: 401, error: 'signing session required' };
  }
  if (session.closedAt) return { ok: false, status: 409, error: 'all documents signed', done: true };
  const expiresAt = asDate(session.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    return { ok: false, status: 401, error: 'signing session expired' };
  }
  if (!SUBMITTED_INVITE_STATUSES.includes(invite.data.status)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const userSnap = await adminDb.collection('users').doc(userId).get();
  const user = userSnap.exists ? userSnap.data() : undefined;
  const sameEmail =
    typeof user?.email === 'string' &&
    typeof invite.data.candidateEmail === 'string' &&
    user.email.trim().toLowerCase() === invite.data.candidateEmail.trim().toLowerCase();
  if (!user || user.status !== 'pending' || user.onboardingInviteId !== invite.id || !sameEmail) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  return { ok: true, userId, inviteRef: invite.ref, user, items: esignItemsFor(user) };
}

/** Every e-sign item on the checklist approved: the step is over. */
export async function allEsignItemsSigned(userId: string, items: OnboardingItem[]): Promise<boolean> {
  if (!adminDb) return false;
  const snaps = await Promise.all(
    items.map((item) => adminDb!.doc(`userOnboarding/${userId}_${item.id}`).get())
  );
  return snaps.every((snap) => snap.get('status') === 'approved');
}

/** Ends the session once everything is signed; the key stops working. */
export async function closeSigningSession(inviteRef: FirebaseFirestore.DocumentReference): Promise<void> {
  try {
    await inviteRef.set({ esignSession: { closedAt: new Date() }, updatedAt: new Date() }, { merge: true });
  } catch (error) {
    console.error('[onboard sign] failed to close the signing session', error);
  }
}
