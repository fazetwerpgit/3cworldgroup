import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { NATIVE_PUSH_PLATFORM, nativeTokenEntry } from './pushTargets';

export type PushTokenPlatform = 'web' | typeof NATIVE_PUSH_PLATFORM;

/**
 * Registers a device's FCM token on users/{uid} and takes it off every OTHER
 * user doc in the same transaction.
 *
 * A token belongs to one device. When a phone switches accounts and the old
 * account's sign-out DELETE never landed, the old user still holds the token
 * and the new user's phone receives the old user's pushes (sales, pay). The
 * device that registers last owns the token.
 *
 * Both lists are checked whatever the platform: web tokens on pushTokens[]
 * (plain strings) and app tokens on nativePushTokens[] ({ token, platform },
 * matched with array-contains on the exact stored map). Idempotent: running
 * it again finds no other holders and re-adds nothing new.
 */
export async function claimPushToken(
  db: Firestore,
  uid: string,
  token: string,
  platform: PushTokenPlatform
): Promise<{ removedFrom: string[] }> {
  const users = db.collection('users');
  const entry = nativeTokenEntry(token);

  return db.runTransaction(async (tx) => {
    const [webHolders, nativeHolders] = await Promise.all([
      tx.get(users.where('pushTokens', 'array-contains', token)),
      tx.get(users.where('nativePushTokens', 'array-contains', entry)),
    ]);

    // One update per other doc, even when it holds the token in both lists.
    const removals = new Map<string, { ref: DocumentReference; data: Record<string, unknown> }>();
    const removeFrom = (ref: DocumentReference, field: 'pushTokens' | 'nativePushTokens', value: unknown) => {
      if (ref.id === uid) return;
      const current = removals.get(ref.id) ?? { ref, data: {} };
      current.data[field] = FieldValue.arrayRemove(value);
      removals.set(ref.id, current);
    };
    for (const doc of webHolders.docs) removeFrom(doc.ref, 'pushTokens', token);
    for (const doc of nativeHolders.docs) removeFrom(doc.ref, 'nativePushTokens', entry);

    for (const { ref, data } of removals.values()) tx.update(ref, data);

    tx.set(
      users.doc(uid),
      {
        ...(platform === NATIVE_PUSH_PLATFORM
          ? { nativePushTokens: FieldValue.arrayUnion(entry) }
          : { pushTokens: FieldValue.arrayUnion(token) }),
        // Stamped on every (re-)registration, including no-op same-token ones —
        // lets ops tell "device re-registered, token unchanged" apart from
        // "client never ran registration" when debugging delivery.
        pushTokensUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { removedFrom: [...removals.keys()] };
  });
}
