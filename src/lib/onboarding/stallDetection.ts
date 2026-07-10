import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { nudgeEmail, appBaseUrl, type NudgeTier } from '@/lib/email/templates';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { roleRequiresOnboarding } from '@/types/auth';
import { getActivationReadiness } from './activation';

export type { NudgeTier };

const TIER_MS: Record<NudgeTier, number> = {
  h24: 24 * 3600 * 1000,
  h72: 72 * 3600 * 1000,
  d7: 7 * 24 * 3600 * 1000,
};

const TIER_ORDER: NudgeTier[] = ['h24', 'h72', 'd7'];

/** Pure: which nudge tiers are overdue and not yet sent. */
export function dueNudges(
  lastActivityAt: Date,
  now: Date,
  alreadySent: NudgeTier[]
): NudgeTier[] {
  const idle = now.getTime() - lastActivityAt.getTime();
  return TIER_ORDER.filter((tier) => idle >= TIER_MS[tier] && !alreadySent.includes(tier));
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const maybeTimestamp = value as { toDate?: () => Date };
  return typeof maybeTimestamp.toDate === 'function' ? maybeTimestamp.toDate() : (value as Date);
}

export async function runOnboardingNudges(
  now: Date
): Promise<{ nudged: number; flaggedAtRisk: number }> {
  if (!adminDb) {
    console.error('[onboardingNudges] Firebase Admin database is not configured');
    return { nudged: 0, flaggedAtRisk: 0 };
  }

  const db = adminDb;
  const pending = await db.collection('users').where('status', '==', 'pending').get();
  let nudged = 0;
  let flaggedAtRisk = 0;

  for (const userDoc of pending.docs) {
    try {
      const uid = userDoc.id;
      if (!roleRequiresOnboarding(userDoc.get('fieldRole'))) continue;

      const itemsSnap = await db.collection('userOnboarding').where('userId', '==', uid).get();
      let lastActivity = toDate(userDoc.get('createdAt')) ?? now;
      itemsSnap.forEach((doc) => {
        const updatedAt = toDate(doc.get('updatedAt'));
        if (updatedAt && updatedAt > lastActivity) lastActivity = updatedAt;
      });

      const { ready } = await getActivationReadiness(uid);
      if (ready) continue;

      const nudgeRef = db.doc(`onboardingNudges/${uid}`);
      const nudgeSnap = await nudgeRef.get();
      const sent = (nudgeSnap.get('sent') as NudgeTier[] | undefined) ?? [];
      const due = dueNudges(lastActivity, now, sent);
      if (due.length === 0) continue;

      const name = (userDoc.get('displayName') as string | undefined) ?? 'there';
      const portalUrl = `${appBaseUrl()}/portal/onboarding`;
      const sentNow: NudgeTier[] = [];

      try {
        for (const tier of due) {
          await dispatchToUser({
            userId: uid,
            type: 'onboarding_nudge',
            title:
              tier === 'h24'
                ? 'Your onboarding is waiting'
                : tier === 'h72'
                  ? 'Onboarding reminder'
                  : 'Final onboarding reminder',
            message: 'Pick up where you left off - a few steps remain.',
            link: '/portal/onboarding',
            email: nudgeEmail({ name, tier, portalUrl }),
          });

          sentNow.push(tier);
          nudged += 1;

          if (tier === 'h72') {
            await createAlertTask({
              kind: 'stalled_rep',
              subjectUserId: uid,
              subjectName: name,
              title: `${name} has stalled in onboarding`,
              message: 'No progress for 72 hours. Reach out and unblock them.',
              link: '/portal/admin/onboarding',
            });
          }

          if (tier === 'd7') {
            await userDoc.ref.update({ atRisk: true, updatedAt: now });
            flaggedAtRisk += 1;
          }
        }
      } finally {
        if (sentNow.length > 0) {
          // v1 intentionally does not re-arm previously sent tiers after new progress.
          await nudgeRef.set({ sent: [...sent, ...sentNow], updatedAt: now }, { merge: true });
        }
      }
    } catch (error) {
      console.error('[nudges] failed to process user', userDoc.id, error);
    }
  }

  return { nudged, flaggedAtRisk };
}
