import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { nudgeEmail, appBaseUrl, type NudgeTier } from '@/lib/email/templates';
import { onboardingFrom } from '@/lib/email/sendEmail';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { roleRequiresOnboarding, type FieldRole } from '@/types/auth';
import { getOnboardingItemsForUser, type OnboardingStatus } from '@/types/onboarding';
import { isHeldOnboardingItem } from '@/types/onboardingHold';
import { getActivationReadiness } from './activation';
import { isEsignItem } from './esign';

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
      // Idle is measured from the hire's own actions (submitting, working a
      // not-started item) or from a rejection handing work back - never from a
      // reviewer's approval, which says nothing about whether the hire is engaged.
      let lastActivity = toDate(userDoc.get('createdAt')) ?? now;
      const statuses: Record<string, OnboardingStatus> = {};
      itemsSnap.forEach((doc) => {
        const status = doc.get('status') as OnboardingStatus | undefined;
        if (status) statuses[doc.get('itemId') as string] = status;
        const own =
          status === 'not_started'
            ? toDate(doc.get('updatedAt'))
            : status === 'rejected'
              ? toDate(doc.get('reviewedAt')) ?? toDate(doc.get('updatedAt'))
              : undefined;
        for (const at of [toDate(doc.get('submittedAt')), own]) {
          if (at && at > lastActivity) lastActivity = at;
        }
      });

      const { ready } = await getActivationReadiness(uid);
      if (ready) continue;

      // Nothing left for the hire: every owed item is approved or waiting on
      // management review. (An e-sign item 'submitted' is out for their
      // signature, so they still owe it.) The delay is the back office's.
      const owed = getOnboardingItemsForUser(userDoc.get('fieldRole') as FieldRole, userDoc.get('isIBO') === true)
        .filter((item) => !isHeldOnboardingItem(item.id));
      const hireOwesSomething = owed.some((item) => {
        const status = statuses[item.id];
        return status !== 'approved' && !(status === 'submitted' && !isEsignItem(item.id));
      });
      if (!hireOwesSomething) continue;

      const nudgeRef = db.doc(`onboardingNudges/${uid}`);
      const nudgeSnap = await nudgeRef.get();
      const sent = (nudgeSnap.get('sent') as NudgeTier[] | undefined) ?? [];
      // At most one tier per run: a hire first seen after days idle gets the
      // 24h nudge now and the next tier on a later run, not all at once.
      const tier = dueNudges(lastActivity, now, sent)[0];
      if (!tier) continue;

      const name = (userDoc.get('displayName') as string | undefined) ?? 'there';
      const portalUrl = `${appBaseUrl()}/portal/onboarding`;

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
        emailFrom: onboardingFrom(),
      });
      nudged += 1;
      // v1 intentionally does not re-arm previously sent tiers after new progress.
      await nudgeRef.set({ sent: [...sent, tier], updatedAt: now }, { merge: true });

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
    } catch (error) {
      console.error('[nudges] failed to process user', userDoc.id, error);
    }
  }

  return { nudged, flaggedAtRisk };
}
