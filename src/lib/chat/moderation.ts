import { adminDb } from '@/lib/firebase/admin';
import { getManagementUserIds } from '@/lib/alerts/alertTasks';
import { sendEmail } from '@/lib/email/sendEmail';
import { emailFromUserDoc } from '@/lib/email/userEmail';
import { appBaseUrl, managerAlertEmail } from '@/lib/email/templates';
import { sendPushToUser } from '@/lib/push/sendPush';
import { takeAlertSlot } from './moderationLimits';

// Team chat moderation (App Store guideline 1.2): reports of a message, per-user
// blocks, and the alert that tells the back office about either. Reports live in
// chatReports/{messageId}_{reporterUid} (one per person per message); blocks in
// users/{uid}/chatBlocks/{blockedUid}. Both are Admin SDK only: the rules deny
// every client read and write.

export {
  CHAT_REPORTS_PATH,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  chatReportId,
  isReportReason,
  isSafeDocId,
  type ReportReason,
} from './moderationShared';

export interface ChatModerationAlert {
  title: string;
  message: string;
  link: string;
  /** Who caused it (the reporter or blocker): alerts are throttled per actor. */
  actorId: string;
  /** Never alerted, even if they're back office (the blocked or reported person). */
  excludeUids?: string[];
}

/** "... (3 more since the last alert)" when throttled alerts were folded in. */
export function withFoldedCount(message: string, folded: number): string {
  if (folded <= 0) return message;
  return `${message} (${folded} more from this person since the last alert.)`;
}

/**
 * Tells every back-office user (owner, admin, operations: the people who can
 * remove a message) by push and email, at most once per actor per
 * ALERT_WINDOW_MS (later ones are folded into the next alert's count; the
 * queue still lists every report). Every send is awaited; failures are logged
 * per channel and never thrown, so the caller's write always stands. The alert
 * never carries the reported text: it can be the very thing that should not
 * be spread further.
 */
export async function notifyChatModerators(alert: ChatModerationAlert): Promise<void> {
  if (!adminDb) return;
  const db = adminDb;
  try {
    const slot = await takeAlertSlot(alert.actorId);
    if (!slot.send) return;
    const message = withFoldedCount(alert.message, slot.folded);
    const excluded = new Set(alert.excludeUids ?? []);
    const userIds = (await getManagementUserIds()).filter((uid) => !excluded.has(uid));
    const email = managerAlertEmail({ title: alert.title, message, link: `${appBaseUrl()}${alert.link}` });
    const results = await Promise.allSettled(
      userIds.flatMap((uid) => [
        sendPushToUser(uid, { title: alert.title, body: message, url: alert.link }),
        (async () => {
          const snap = await db.collection('users').doc(uid).get();
          const to = emailFromUserDoc(snap);
          if (to) await sendEmail({ to, ...email });
        })(),
      ])
    );
    for (const result of results) {
      if (result.status === 'rejected') console.error('[chat moderation] alert channel failed', result.reason);
    }
  } catch (err) {
    console.error('[chat moderation] alert failed', err);
  }
}
