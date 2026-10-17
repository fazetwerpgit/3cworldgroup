import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { ASK_LOG, PRACTICE_LOG } from './store';

const BATCH_LIMIT = 400;

/**
 * Self-delete (privacy policy section 9): the person's Ask 3C questions and
 * Practice sessions are kept, but the name stamped on each row is replaced, so
 * the history reads as "Deleted user". The uid stays: it only ties rows to an
 * anonymized profile, and daily-usage counts still need it.
 * Returns how many rows were re-stamped.
 */
export async function anonymizeAskHistory(db: Firestore, uid: string, name: string): Promise<number> {
  let total = 0;
  for (const collection of [ASK_LOG, PRACTICE_LOG]) {
    let last: QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = db.collection(collection).where('uid', '==', uid).limit(BATCH_LIMIT);
      if (last) query = query.startAfter(last);
      const snap = await query.get();
      if (snap.empty) break;
      const batch = db.batch();
      for (const doc of snap.docs) batch.update(doc.ref, { repName: name });
      await batch.commit();
      total += snap.docs.length;
      if (snap.docs.length < BATCH_LIMIT) break;
      last = snap.docs[snap.docs.length - 1];
    }
  }
  return total;
}
