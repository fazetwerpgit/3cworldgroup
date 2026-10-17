import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { ASK_LOG, PRACTICE_ASSIGNMENTS, PRACTICE_CORRECTIONS, PRACTICE_LOG } from './store';

const BATCH_LIMIT = 400;
/** Firestore's cap on the values in one `in` filter. */
const IN_LIMIT = 30;

/**
 * Pages through a query in BATCH_LIMIT chunks, re-stamping repName on every
 * row in one batch per page. Calls onDoc for each row (to collect ids).
 */
async function restamp(
  db: Firestore,
  base: Query,
  name: string,
  onDoc?: (doc: QueryDocumentSnapshot) => void
): Promise<number> {
  let total = 0;
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = base.limit(BATCH_LIMIT);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, { repName: name });
      onDoc?.(doc);
    }
    await batch.commit();
    total += snap.docs.length;
    if (snap.docs.length < BATCH_LIMIT) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return total;
}

/**
 * Self-delete (privacy policy section 9): the person's Ask 3C questions and
 * Practice sessions are kept, but the name stamped on each row is replaced, so
 * the history reads as "Deleted user". The uid stays: it only ties rows to an
 * anonymized profile, and daily-usage counts still need it.
 *
 * The owner's copies of that name go too: practice corrections (they carry
 * only the session's logId, so they are found through the person's practice
 * log ids) and practice assignments made for this rep (repUid == uid).
 * Returns how many rows were re-stamped.
 */
export async function anonymizeAskHistory(db: Firestore, uid: string, name: string): Promise<number> {
  const practiceLogIds: string[] = [];
  let total = await restamp(db, db.collection(ASK_LOG).where('uid', '==', uid), name);
  total += await restamp(db, db.collection(PRACTICE_LOG).where('uid', '==', uid), name, (doc) => {
    practiceLogIds.push(doc.id);
  });

  for (let i = 0; i < practiceLogIds.length; i += IN_LIMIT) {
    const chunk = practiceLogIds.slice(i, i + IN_LIMIT);
    total += await restamp(db, db.collection(PRACTICE_CORRECTIONS).where('logId', 'in', chunk), name);
  }

  total += await restamp(db, db.collection(PRACTICE_ASSIGNMENTS).where('repUid', '==', uid), name);
  return total;
}
