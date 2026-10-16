import { FieldValue, type Firestore } from 'firebase-admin/firestore';

// Shared pieces of closing an account: the last-owner rule the admin user
// route enforces, and the profile anonymization a self-service delete applies
// (SPEC A3, App Store 5.1.1(v)).

/** The name every anonymized profile shows from now on. */
export const DELETED_USER_NAME = 'Deleted user';

/**
 * True when some OTHER user is an active owner. Only an owner can grant the
 * owner role, so losing the last active one locks payroll, comp plan and
 * exports until Firestore is edited by hand.
 */
export async function hasOtherActiveOwner(db: Firestore, uid: string): Promise<boolean> {
  const owners = await db.collection('users').where('role', '==', 'owner').get();
  return owners.docs.some((owner) => owner.id !== uid && owner.get('status') === 'active');
}

export class LastOwnerError extends Error {
  constructor() {
    super('last active owner');
    this.name = 'LastOwnerError';
  }
}

/**
 * First write of a self-delete, race-safe: in one transaction, re-reads the
 * account and the owner list, refuses (LastOwnerError) if this is the last
 * active owner, and otherwise flips the account to inactive + selfDeleted.
 * Two owners deleting at the same moment serialize here, so one of them stays.
 */
export async function beginSelfDelete(db: Firestore, uid: string, now: Date = new Date()): Promise<void> {
  const ref = db.collection('users').doc(uid);
  const ownersQuery = db.collection('users').where('role', '==', 'owner');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const status = snap.get('status');
    if (snap.get('role') === 'owner' && status === 'active') {
      const owners = await tx.get(ownersQuery);
      if (!owners.docs.some((owner) => owner.id !== uid && owner.get('status') === 'active')) {
        throw new LastOwnerError();
      }
    }
    tx.update(ref, {
      status: 'inactive',
      selfDeleted: true,
      selfDeleteStartedAt: now,
      deactivatedFromStatus: typeof status === 'string' && status !== 'inactive' ? status : null,
      updatedAt: now,
    });
  });
}

/**
 * Personal fields removed from users/{uid} when the person deletes their own
 * account. Everything that identifies or reaches them goes; the ids that tie
 * their sales and pay history together (role, fieldRole, reportsToId,
 * territoryId, salesRepId, hireDate ...) stay, so payroll and carrier
 * reconciliation still balance. SSN / licence data lives in userSensitive and
 * storage and is purged separately (purgeSensitiveUserData).
 */
export const PERSONAL_PROFILE_FIELDS = [
  'email',
  // Some legacy docs store the address as 'Email' (see lib/email/userEmail.ts).
  'Email',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'shirtSize',
  'avatarUrl',
  'photoURL',
  'pushTokens',
  'nativePushTokens',
  'pushTokensUpdatedAt',
  'pushHealth',
  'pushRequired',
  'lastActiveAt',
] as const;

/** The users/{uid} update that anonymizes a self-deleted account. */
export function anonymizedProfileUpdate(
  previousStatus: unknown,
  now: Date = new Date()
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    displayName: DELETED_USER_NAME,
    status: 'inactive',
    selfDeleted: true,
    deletedAt: now,
    updatedAt: now,
  };
  for (const field of PERSONAL_PROFILE_FIELDS) update[field] = FieldValue.delete();
  // Same marker the admin deactivate path stamps, so a reactivation check
  // reads this account the way it reads any other deactivated one.
  if (previousStatus !== 'inactive') update.deactivatedFromStatus = typeof previousStatus === 'string' ? previousStatus : null;
  return update;
}
