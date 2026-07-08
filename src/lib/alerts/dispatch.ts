import { adminDb } from '@/lib/firebase/admin';
import { createNotification } from '@/lib/notifications/createNotification';
import { sendEmail } from '@/lib/email/sendEmail';
import type { EmailContent } from '@/lib/email/templates';
import { sendPushToUser } from '@/lib/push/sendPush';
import type { NotificationType } from '@/types/notifications';

export interface DispatchInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  email?: EmailContent;
  metadata?: Record<string, unknown>;
}

/**
 * One call = all three channels: in-app bell (always), FCM push (best-effort),
 * email (only when content provided). Push/email failures are logged, never thrown.
 */
export async function dispatchToUser(input: DispatchInput): Promise<void> {
  await createNotification({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link,
    metadata: input.metadata,
  });

  const results = await Promise.allSettled([
    sendPushToUser(input.userId, { title: input.title, body: input.message, url: input.link }),
    input.email
      ? (async () => {
          if (!adminDb) throw new Error('Database not configured');
          const snap = await adminDb.doc(`users/${input.userId}`).get();
          const to = snap.get('email') as string | undefined;
          if (to) await sendEmail({ to, ...input.email! });
        })()
      : Promise.resolve(),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('[dispatch] channel failed', r.reason);
  }
}
