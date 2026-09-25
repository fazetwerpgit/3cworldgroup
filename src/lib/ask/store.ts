import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { KNOWLEDGE_NOTES, sortNotes, type KnowledgeNote } from './notes';

// Ask 3C's Firestore, server side only (firestore.rules deny every client
// read and write on these collections):
//   knowledgeNotes/{id}        the owner's notes
//   askLog/{id}                one doc per exchange (never the photo)
//   askUsage/{uid}_{day}       questions a rep asked on a Chicago day

export const ASK_LOG = 'askLog';
export const ASK_USAGE = 'askUsage';
export const ASK_DAILY_LIMIT = 60;

export type AskRating = 'up' | 'down';

/** A Firestore Timestamp or Date as ISO, else null. */
export function isoTime(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === 'function' ? stamp.toDate().toISOString() : null;
}

export async function loadNotes(db: FirebaseFirestore.Firestore): Promise<KnowledgeNote[]> {
  const snap = await db.collection(KNOWLEDGE_NOTES).get();
  return sortNotes(
    snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: typeof data.title === 'string' ? data.title : '',
        body: typeof data.body === 'string' ? data.body : '',
        order: typeof data.order === 'number' ? data.order : 0,
        updatedAt: isoTime(data.updatedAt),
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
      };
    })
  );
}

/**
 * Counts one question against the rep's day (America/Chicago) and answers
 * whether it is within ASK_DAILY_LIMIT. A transaction, so two phones racing
 * cannot both take the last one.
 */
export async function takeDailyAsk(db: FirebaseFirestore.Firestore, uid: string, now: Date): Promise<boolean> {
  const day = chicagoDayKey(now);
  const ref = db.collection(ASK_USAGE).doc(`${uid}_${day}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number(snap.get('count')) || 0 : 0;
    if (used >= ASK_DAILY_LIMIT) return false;
    tx.set(ref, { uid, day, count: used + 1, updatedAt: now });
    return true;
  });
}

/** The dealer codes config/fiberRepMap maps to this uid, and only this uid's. */
export async function ownDealerCodes(db: FirebaseFirestore.Firestore, uid: string): Promise<string[]> {
  const snap = await db.collection('config').doc('fiberRepMap').get();
  const map = snap.data()?.map;
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map as Record<string, unknown>)
    .filter(([, mapped]) => mapped === uid)
    .map(([code]) => code)
    .sort();
}
