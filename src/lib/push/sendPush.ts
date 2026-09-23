import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { app, adminDb } from '@/lib/firebase/admin';

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // deep link opened on notification click
}

export interface PushResult {
  /** Devices FCM accepted the message for. */
  delivered: number;
  /** Devices it did not (dead tokens included). */
  failed: number;
}

// Sends a web push to every device token registered on a user. Best-effort: never
// throws into the caller's request flow (mirrors notifySubmission). Prunes tokens
// FCM reports as invalid so the user's token list stays clean.
// Messages MUST stay data-only: public/firebase-messaging-sw.js builds the one
// notification itself from data.title/body/url (a notification field has
// historically produced duplicate notifications on iOS).
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<void> {
  if (!app || !adminDb) return;
  try {
    const snap = await adminDb.collection('users').doc(uid).get();
    const tokens: string[] = (snap.data()?.pushTokens as string[] | undefined) ?? [];
    await sendPushToTokens(uid, tokens, payload);
  } catch (err) {
    console.error('Failed to send push to user', uid, err);
  }
}

// The send itself, for callers that already hold the user's tokens (the
// announcement fan-out reads every user in one query). Same data-only message
// and dead-token cleanup as sendPushToUser; never throws, reports counts.
export async function sendPushToTokens(uid: string, tokens: string[], payload: PushPayload): Promise<PushResult> {
  if (!app || !adminDb || tokens.length === 0) return { delivered: 0, failed: tokens.length };
  try {
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
    const delivered = res.responses.filter((r) => r.success).length;
    return { delivered, failed: tokens.length - delivered };
  } catch (err) {
    console.error('Failed to send push to user', uid, err);
    return { delivered: 0, failed: tokens.length };
  }
}
