import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { app, adminDb } from '@/lib/firebase/admin';
import { nativeTokenEntry, pushTargetsOf, type PushTargets } from './pushTargets';

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
  /** Dead tokens removed from the user's token list. */
  pruned: number;
}

export interface PushOptions {
  // Web Push Urgency header. 'high' asks the push service (and iOS) to deliver
  // now instead of batching for battery; leave unset for routine pushes.
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

export { NATIVE_PUSH_PLATFORM, nativeTokenEntry, pushTargetsOf, type NativePushTokenEntry, type PushTargets } from './pushTargets';

// Sends a push to every device registered on a user. Best-effort: never
// throws into the caller's request flow (mirrors notifySubmission). Prunes tokens
// FCM reports as invalid so the user's token lists stay clean.
// Web messages MUST stay data-only: public/firebase-messaging-sw.js builds the one
// notification itself from data.title/body/url (a notification field has
// historically produced duplicate notifications on iOS). Native (iOS app)
// messages carry notification + apns instead: there is no service worker in
// the app, so iOS itself has to show them.
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<void> {
  if (!app || !adminDb) return;
  try {
    const snap = await adminDb.collection('users').doc(uid).get();
    await sendPushToTokens(uid, pushTargetsOf(snap.data()), payload);
  } catch (err) {
    console.error('Failed to send push to user', uid, err);
  }
}

function isDeadTokenError(code: string): boolean {
  return code.includes('registration-token-not-registered') || code.includes('invalid-argument');
}

// The send itself, for callers that already hold the user's tokens (the
// announcement fan-out reads every user in one query). A plain array is web
// tokens only (the original behavior); PushTargets adds the app's native
// tokens. Same dead-token cleanup for both; never throws, reports counts
// summed across platforms.
export async function sendPushToTokens(
  uid: string,
  tokens: string[] | PushTargets,
  payload: PushPayload,
  options: PushOptions = {}
): Promise<PushResult> {
  const targets: PushTargets = Array.isArray(tokens) ? { web: tokens, native: [] } : tokens;
  const total = targets.web.length + targets.native.length;
  if (!app || !adminDb || total === 0) return { delivered: 0, failed: total, pruned: 0 };
  const db = adminDb;
  try {
    const messaging = getMessaging(app);
    const data = {
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/portal/dashboard',
    };
    // Each platform fails on its own: an APNs outage must not lose the web count.
    const settle = <T>(send: Promise<T>) =>
      send.catch((err) => {
        console.error('Failed to send push to user', uid, err);
        return null;
      });
    const [webRes, nativeRes] = await Promise.all([
      targets.web.length
        ? settle(messaging.sendEachForMulticast({
            tokens: targets.web,
            data,
            ...(options.urgency ? { webpush: { headers: { Urgency: options.urgency } } } : {}),
          }))
        : null,
      targets.native.length
        ? settle(messaging.sendEachForMulticast({
            tokens: targets.native,
            notification: { title: payload.title, body: payload.body },
            // data.url is the deep link the shell opens in the WebView on tap.
            data,
            apns: {
              ...(options.urgency === 'high' ? { headers: { 'apns-priority': '10' } } : {}),
              payload: { aps: { sound: 'default', badge: 1 } },
            },
          }))
        : null,
    ]);

    // Remove tokens FCM says are no longer valid.
    const deadOf = (res: typeof webRes, list: string[]) => {
      const dead: string[] = [];
      res?.responses.forEach((r, i) => {
        if (!r.success && isDeadTokenError(r.error?.code ?? '')) dead.push(list[i]);
      });
      return dead;
    };
    const deadWeb = deadOf(webRes, targets.web);
    const deadNative = deadOf(nativeRes, targets.native);
    if (deadWeb.length || deadNative.length) {
      await db.collection('users').doc(uid).set(
        {
          ...(deadWeb.length ? { pushTokens: FieldValue.arrayRemove(...deadWeb) } : {}),
          ...(deadNative.length ? { nativePushTokens: FieldValue.arrayRemove(...deadNative.map(nativeTokenEntry)) } : {}),
        },
        { merge: true }
      );
    }
    const delivered =
      (webRes?.responses.filter((r) => r.success).length ?? 0) + (nativeRes?.responses.filter((r) => r.success).length ?? 0);
    return { delivered, failed: total - delivered, pruned: deadWeb.length + deadNative.length };
  } catch (err) {
    console.error('Failed to send push to user', uid, err);
    return { delivered: 0, failed: total, pruned: 0 };
  }
}
