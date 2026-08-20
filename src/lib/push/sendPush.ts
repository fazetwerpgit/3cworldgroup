import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { app, adminDb } from '@/lib/firebase/admin';

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // deep link opened on notification click
}

// Sends a web push to every device token registered on a user. Best-effort: never
// throws into the caller's request flow (mirrors notifySubmission). Prunes tokens
// FCM reports as invalid so the user's token list stays clean.
// Messages MUST stay data-only: a notification field makes the FCM SDK auto-display
// in addition to firebase-messaging-sw.js's onBackgroundMessage showNotification,
// producing duplicate notifications on iOS.
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<void> {
  if (!app || !adminDb) return;
  try {
    const snap = await adminDb.collection('users').doc(uid).get();
    const tokens: string[] = (snap.data()?.pushTokens as string[] | undefined) ?? [];
    if (tokens.length === 0) return;

    const messaging = getMessaging(app);
    const res = await messaging.sendEachForMulticast({
      tokens,
      data: {
        title: payload.title,
        body: payload.body,
        url: payload.url ?? '/portal/dashboard',
      },
    });

    // Remove tokens FCM says are no longer valid.
    const dead: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          dead.push(tokens[i]);
        }
      }
    });
    if (dead.length) {
      await adminDb.collection('users').doc(uid).set(
        { pushTokens: FieldValue.arrayRemove(...dead) },
        { merge: true }
      );
    }
  } catch (err) {
    console.error('Failed to send push to user', uid, err);
  }
}
