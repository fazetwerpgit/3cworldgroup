import { adminDb } from '@/lib/firebase/admin';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import {
  getOnboardingItemsForUser,
  type OnboardingItem,
  type OnboardingStatus,
} from '@/types/onboarding';
import { roleRequiresOnboarding, type FieldRole } from '@/types/auth';

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

/** Call after any approval path. Completes the gate when a pending user goes all-green. */
export async function maybeFlagActivationReady(userId: string): Promise<void> {
  if (!adminDb) return;

  const userRef = adminDb.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists || userSnap.get('status') !== 'pending') return;

  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  if (!roleRequiresOnboarding(fieldRole)) return;

  const { ready } = await getActivationReadiness(userId);
  if (!ready) return;

  const now = new Date();
  await userRef.update({
    fieldRole: 'entry_rep',
    status: 'active',
    hireDate: now,
    atRisk: null,
    updatedAt: now,
  });
  await resolveAlertTasks(userId);

  await dispatchToUser({
    userId,
    type: 'rep_activated',
    title: "Onboarding complete — you're now an Account Executive",
    message: 'Your onboarding is complete and your account is active.',
    link: '/portal',
  });
}
