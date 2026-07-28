import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { activationEmail } from '@/lib/email/templates';
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

/** Activate a ready user and send the single active-account notification. */
export async function activateUser(
  userId: string
): Promise<{ alreadyActive: boolean } | null> {
  if (!adminDb) throw new Error('Database not configured');

  const userRef = adminDb.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return null;
  if (userSnap.get('status') === 'active') return { alreadyActive: true };

  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  const now = new Date();
  await userRef.update({
    status: 'active',
    ...(fieldRole && roleRequiresOnboarding(fieldRole)
      ? { fieldRole: graduatedFieldRole(fieldRole) }
      : {}),
    hireDate: now,
    atRisk: FieldValue.delete(),
    updatedAt: now,
  });

  await resolveAlertTasks(userId);

  const name = (userSnap.get('displayName') as string | undefined) ?? 'Rep';
  await dispatchToUser({
    userId,
    type: 'rep_activated',
    title: 'Welcome aboard - you are active',
    message: 'Your onboarding is complete.',
    link: '/portal',
    email: activationEmail({ name }),
  });

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

  const now = new Date();
  await userRef.update({
    fieldRole: graduatedFieldRole(fieldRole),
    status: 'active',
    hireDate: now,
    atRisk: null,
    updatedAt: now,
  });
  await resolveAlertTasks(userId);

  const graduatedRoleName = RoleDisplayNames[graduatedFieldRole(fieldRole)];
  await dispatchToUser({
    userId,
    type: 'rep_activated',
    title: `Onboarding complete — your new role: ${graduatedRoleName}`,
    message: 'Your onboarding is complete and your account is active.',
    link: '/portal',
  });
}
