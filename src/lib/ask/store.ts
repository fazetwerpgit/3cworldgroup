import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { KNOWLEDGE_NOTES, sortNotes, type KnowledgeNote } from './notes';

// Ask 3C's Firestore, server side only (firestore.rules deny every client
// read and write on these collections):
//   knowledgeNotes/{id}        the owner's notes
//   askLog/{id}                one doc per exchange (never the photo)
//   askUsage/{uid}_{day}       questions a rep asked on a Chicago day
//   askUsage/{uid}_{day}_practice   Practice model calls that day (its own count)
//   practiceLog/{id}           one doc per finished Practice (with its feedback)
//   practiceSessions/{uid}     the rep's current Practice: who is behind the door (hidden from the rep)

export const ASK_LOG = 'askLog';
export const ASK_USAGE = 'askUsage';
export const ASK_DAILY_LIMIT = 60;
export const PRACTICE_LOG = 'practiceLog';
export const PRACTICE_SESSIONS = 'practiceSessions';
/** Homeowner replies and feedback both count: each is a model call. */
export const PRACTICE_DAILY_LIMIT = 150;

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
export function takeDailyAsk(db: FirebaseFirestore.Firestore, uid: string, now: Date): Promise<boolean> {
  return takeDaily(db, uid, now, '', ASK_DAILY_LIMIT);
}

/** Same for Practice, on its own counter: practicing never uses up Ask questions. */
export function takeDailyPractice(db: FirebaseFirestore.Firestore, uid: string, now: Date): Promise<boolean> {
  return takeDaily(db, uid, now, '_practice', PRACTICE_DAILY_LIMIT);
}

async function takeDaily(
  db: FirebaseFirestore.Firestore,
  uid: string,
  now: Date,
  suffix: string,
  limit: number
): Promise<boolean> {
  const day = chicagoDayKey(now);
  const ref = db.collection(ASK_USAGE).doc(`${uid}_${day}${suffix}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number(snap.get('count')) || 0 : 0;
    if (used >= limit) return false;
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

/** "City, ST" from the rep's profile, or '' when neither is set. */
export async function repHome(db: FirebaseFirestore.Firestore, uid: string): Promise<string> {
  const data = (await db.collection('users').doc(uid).get()).data() ?? {};
  const city = typeof data.city === 'string' ? data.city.trim() : '';
  const state = typeof data.state === 'string' ? data.state.trim() : '';
  return [city, state].filter(Boolean).join(', ');
}
