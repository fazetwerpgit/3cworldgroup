import type { DocumentData, Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { ASK_LOG, PRACTICE_ASSIGNMENTS, PRACTICE_CORRECTIONS, PRACTICE_LOG, PRACTICE_SESSIONS } from './store';

const BATCH_LIMIT = 400;
/** Firestore's cap on the values in one `in` filter. */
const IN_LIMIT = 30;
/** What stands in for the rep's own name inside kept Practice text. */
export const SCRUBBED_NAME = '[rep]';

/** Extra fields to write on a row, from its data and the name it was stamped with. */
type Scrub = (data: DocumentData, names: string[]) => Record<string, unknown>;

/**
 * The words of the name stamped on a row (its old repName), to take out of
 * its free text. Rows already re-stamped give nothing, so a retry is a no-op.
 */
function nameWords(repName: unknown, replacement: string): string[] {
  if (typeof repName !== 'string' || repName === replacement) return [];
  return [...new Set(repName.trim().split(/\s+/).filter((word) => word.length >= 2))];
}

/**
 * Replaces each whole-word, same-case use of the names in text. Case is kept
 * so a rep named Will doesn't blank every "will" in a transcript.
 */
export function scrubName(text: string, names: string[]): string {
  let out = text;
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'), SCRUBBED_NAME);
  }
  return out;
}

/** Scrubs the given string fields of a row; only the ones that change are written. */
function scrubFields(fields: string[]): Scrub {
  return (data, names) => {
    const update: Record<string, unknown> = {};
    for (const field of fields) {
      const value = data[field];
      if (typeof value !== 'string') continue;
      const scrubbed = scrubName(value, names);
      if (scrubbed !== value) update[field] = scrubbed;
    }
    return update;
  };
}

/** A practice log row: its feedback (the coach's Try line uses the rep's first name) and its transcript. */
const scrubPracticeLog: Scrub = (data, names) => {
  const update = scrubFields(['feedback'])(data, names);
  if (Array.isArray(data.turns)) {
    let changed = false;
    const turns = data.turns.map((turn: unknown) => {
      if (!turn || typeof turn !== 'object' || typeof (turn as { text?: unknown }).text !== 'string') return turn;
      const text = (turn as { text: string }).text;
      const scrubbed = scrubName(text, names);
      if (scrubbed === text) return turn;
      changed = true;
      return { ...(turn as Record<string, unknown>), text: scrubbed };
    });
    if (changed) update.turns = turns;
  }
  return update;
};

/**
 * Pages through a query in BATCH_LIMIT chunks, re-stamping repName on every
 * row in one batch per page (plus whatever scrub returns for the row's text).
 * Calls onDoc for each row (to collect ids).
 */
async function restamp(
  db: Firestore,
  base: Query,
  name: string,
  onDoc?: (doc: QueryDocumentSnapshot) => void,
  scrub?: Scrub
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
      const data = scrub ? doc.data() : undefined;
      const names = data ? nameWords(data.repName, name) : [];
      batch.update(doc.ref, { ...(data && names.length ? scrub!(data, names) : {}), repName: name });
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
 * The name also goes from the kept Practice text: the coach's feedback (its
 * Try line has the rep introduce themselves by first name) and the rep's own
 * lines in the transcript. The live practice session (practiceSessions/{uid},
 * transcript and feedback) is deleted outright.
 *
 * The owner's copies of that name go too: practice corrections (they carry
 * only the session's logId, so they are found through the person's practice
 * log ids; their quoted feedback and take are scrubbed the same way) and
 * practice assignments made for this rep (repUid == uid).
 * Returns how many rows were re-stamped.
 */
export async function anonymizeAskHistory(db: Firestore, uid: string, name: string): Promise<number> {
  const practiceLogIds: string[] = [];
  let total = await restamp(db, db.collection(ASK_LOG).where('uid', '==', uid), name);
  total += await restamp(
    db,
    db.collection(PRACTICE_LOG).where('uid', '==', uid),
    name,
    (doc) => {
      practiceLogIds.push(doc.id);
    },
    scrubPracticeLog
  );

  for (let i = 0; i < practiceLogIds.length; i += IN_LIMIT) {
    const chunk = practiceLogIds.slice(i, i + IN_LIMIT);
    total += await restamp(
      db,
      db.collection(PRACTICE_CORRECTIONS).where('logId', 'in', chunk),
      name,
      undefined,
      scrubFields(['original', 'take'])
    );
  }

  total += await restamp(db, db.collection(PRACTICE_ASSIGNMENTS).where('repUid', '==', uid), name);
  await db.collection(PRACTICE_SESSIONS).doc(uid).delete();
  return total;
}
