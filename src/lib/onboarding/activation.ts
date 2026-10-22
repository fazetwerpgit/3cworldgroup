import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { activationEmail } from '@/lib/email/templates';
import { onboardingFrom } from '@/lib/email/sendEmail';
import { sendOnboardingPacket } from '@/lib/onboarding/ownerNotify';
import { TEST_ACCOUNT_FIELD } from '@/lib/users/demoAccount';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import {
  getOnboardingItemsForUser,
  type OnboardingItem,
  type OnboardingStatus,
} from '@/types/onboarding';
import { graduatedFieldRole, roleRequiresOnboarding, RoleDisplayNames, type FieldRole } from '@/types/auth';

export interface ActivationReadiness {
  ready: boolean;
  missing: string[];
}

export function computeReadiness(
  applicable: OnboardingItem[],
  statuses: Record<string, OnboardingStatus>
): ActivationReadiness {
  const missing = applicable
    .filter((item) => statuses[item.id] !== 'approved')
    .map((item) => item.id);
  return { ready: missing.length === 0, missing };
}

async function loadStatuses(userId: string): Promise<Record<string, OnboardingStatus>> {
  if (!adminDb) return {};

  const snap = await adminDb.collection('userOnboarding').where('userId', '==', userId).get();
  const statuses: Record<string, OnboardingStatus> = {};
  snap.forEach((doc) => {
    const itemId = doc.get('itemId') as string | undefined;
    const status = doc.get('status') as OnboardingStatus | undefined;
    if (itemId && status) statuses[itemId] = status;
  });
  return statuses;
}

export async function getActivationReadiness(userId: string): Promise<ActivationReadiness> {
  if (!adminDb) return { ready: false, missing: ['database'] };

  const userSnap = await adminDb.doc(`users/${userId}`).get();
  if (!userSnap.exists) return { ready: false, missing: ['user'] };

  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  if (!fieldRole) return { ready: false, missing: ['fieldRole'] };
  if (!roleRequiresOnboarding(fieldRole)) return { ready: false, missing: [] };

  const applicable = getOnboardingItemsForUser(fieldRole, !!userSnap.get('isIBO'));
  return computeReadiness(applicable, await loadStatuses(userId));
}

/**
 * Marks the user's open invites and their linked applications 'converted'.
 * Every activation path runs this so Invites/Applicants never keep an active
 * rep as 'Submitted' (where Reject would deactivate them).
 */
export async function closeOutInvitesForUser(userId: string, now = new Date()): Promise<void> {
  if (!adminDb) return;
  const snap = await adminDb.collection('onboardingInvites').where('convertedUserId', '==', userId).get();
  const writes: Promise<unknown>[] = [];
  snap.forEach((doc) => {
    const status = doc.get('status');
    if (status === 'converted' || status === 'rejected') return;
    writes.push(
      doc.ref.set({ status: 'converted', convertedUserId: userId, updatedAt: now }, { merge: true })
    );
    const applicationId = doc.get('applicationId');
    if (typeof applicationId === 'string' && applicationId) {
      writes.push(
        adminDb!
          .collection('applications')
          .doc(applicationId)
          .set({ status: 'converted', convertedUserId: userId, updatedAt: now }, { merge: true })
      );
    }
  });
  await Promise.all(writes);
}

/**
 * Readiness against the checklist of `fieldRole` (the role the user will hold
 * after an edit), rather than the role stored now.
 */
export async function getActivationReadinessForRole(
  userId: string,
  fieldRole: FieldRole,
  isIBO: boolean
): Promise<ActivationReadiness> {
  if (!adminDb) return { ready: false, missing: ['database'] };
  if (!roleRequiresOnboarding(fieldRole)) return { ready: true, missing: [] };
  return computeReadiness(getOnboardingItemsForUser(fieldRole, isIBO), await loadStatuses(userId));
}

/** users/{uid} field stamped when the rep's owner packet email is claimed (Admin SDK only). */
export const PACKET_EMAILED_FIELD = 'onboardingPacketEmailedAt';

/**
 * Sends the owner onboarding packet at most once per rep, whichever activation
 * path gets there (automatic, manual Activate, recruiting convert, Accept on
 * the user page). The stamp is claimed in a transaction BEFORE sending, so
 * concurrent or repeated paths cannot double-send; a send that fails after the
 * claim is logged, not retried. Test accounts get no packet. Never throws.
 */
export async function sendOnboardingPacketOnce(userId: string): Promise<boolean> {
  try {
    if (!adminDb) return false;
    const db = adminDb;
    const userRef = db.doc(`users/${userId}`);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return false;
      if (snap.get(TEST_ACCOUNT_FIELD) === true || snap.get(PACKET_EMAILED_FIELD)) return false;
      tx.update(userRef, { [PACKET_EMAILED_FIELD]: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) return false;
    await sendOnboardingPacket({ userId });
    return true;
  } catch (error) {
    console.error('[onboarding] owner packet failed', { userId, error });
    return false;
  }
}

/** Activate a ready user and send the single active-account notification. */
export async function activateUser(
  userId: string
): Promise<{ alreadyActive: boolean } | null> {
  if (!adminDb) throw new Error('Database not configured');

  const db = adminDb;
  const userRef = db.doc(`users/${userId}`);
  const now = new Date();
  // Flip pending -> active in a transaction so concurrent approval paths
  // (e-sign completion, review approvals, mark-complete) activate once and
  // only the winning call sends the notification and owner packet.
  const flip = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return null;
    if (snap.get('status') === 'active') return { alreadyActive: true as const };
    const role = snap.get('fieldRole') as FieldRole | undefined;
    tx.update(userRef, {
      status: 'active',
      ...(role && roleRequiresOnboarding(role) ? { fieldRole: graduatedFieldRole(role) } : {}),
      hireDate: now,
      // When the account went active; the owner "Activated" tile counts by this.
      activatedAt: FieldValue.serverTimestamp(),
      atRisk: FieldValue.delete(),
      updatedAt: now,
    });
    return {
      alreadyActive: false as const,
      fieldRole: role,
      name: (snap.get('displayName') as string | undefined) ?? 'Rep',
    };
  });
  if (!flip) return null;
  if (flip.alreadyActive) return { alreadyActive: true };
  const { fieldRole, name } = flip;

  // The graduated role can reach different chat channels than the onboarding one.
  try {
    await reconcileChatMembershipForUser(userId);
  } catch (error) {
    console.error('[onboarding] chat membership reconcile failed', { userId, error });
  }

  // The status flip is committed; a failure here must not skip the rep's
  // notice or the owner packet, and a retry would see 'active' and stop.
  try {
    await resolveAlertTasks(userId);
  } catch (error) {
    console.error('[onboarding] alert task resolve failed', { userId, error });
  }

  try {
    await closeOutInvitesForUser(userId, now);
  } catch (error) {
    console.error('[onboarding] invite close-out failed', { userId, error });
  }

  try {
    await dispatchToUser({
      userId,
      type: 'rep_activated',
      title: fieldRole
        ? `Onboarding complete — your new role: ${RoleDisplayNames[graduatedFieldRole(fieldRole)]}`
        : 'Welcome aboard - you are active',
      message: 'Your onboarding is complete.',
      link: '/portal',
      email: activationEmail({ name }),
      emailFrom: onboardingFrom(),
    });
  } catch (error) {
    console.error('[onboarding] activation notice failed', { userId, error });
  }

  // Every activation path (automatic, manual Activate, recruiting convert)
  // lands here, so the owner packet goes out from one place. A hire with no
  // checklist role would get an empty packet, so none is sent. The stamp in
  // sendOnboardingPacketOnce keeps it to one per rep, even across a later
  // deactivate -> reactivate. It never throws.
  if (fieldRole && roleRequiresOnboarding(fieldRole)) {
    await sendOnboardingPacketOnce(userId);
  }

  return { alreadyActive: false };
}

/** Call after any approval path. Completes the gate when a pending user goes all-green. */
export async function maybeFlagActivationReady(userId: string): Promise<void> {
  if (!adminDb) return;

  const userRef = adminDb.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists || userSnap.get('status') !== 'pending') return;

  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  if (!fieldRole || !roleRequiresOnboarding(fieldRole)) return;

  const { ready } = await getActivationReadiness(userId);
  if (!ready) return;

  // activateUser sends the owner packet on the winning flip.
  await activateUser(userId);
}
