import { adminDb } from '@/lib/firebase/admin';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import {
  getOnboardingItemsForUser,
  type OnboardingItem,
  type OnboardingStatus,
} from '@/types/onboarding';
import type { FieldRole } from '@/types/auth';

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

  const applicable = getOnboardingItemsForUser(fieldRole, !!userSnap.get('isIBO'));
  return computeReadiness(applicable, await loadStatuses(userId));
}

/** Call after any approval path. Alerts management when a pending user goes all-green. */
export async function maybeFlagActivationReady(userId: string): Promise<void> {
  if (!adminDb) return;

  const userSnap = await adminDb.doc(`users/${userId}`).get();
  if (!userSnap.exists || userSnap.get('status') !== 'pending') return;

  const { ready } = await getActivationReadiness(userId);
  if (!ready) return;

  const name = (userSnap.get('displayName') as string | undefined) ?? userId;
  await createAlertTask({
    kind: 'activation_ready',
    subjectUserId: userId,
    subjectName: name,
    title: `${name} is ready to activate`,
    message: 'All onboarding items are approved. One click makes them active.',
    link: '/portal/admin/onboarding',
  });
}
