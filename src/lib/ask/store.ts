import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { KNOWLEDGE_NOTES, sortNotes, type KnowledgeNote } from './notes';
import {
  CORRECTIONS_IN_PROMPT,
  CORRECTION_PARTS,
  type CoachCorrection,
  type CountedSession,
  type PracticeAssignment,
} from './practiceCoaching';
import { isPersonaId } from './practice';

// Ask 3C's Firestore, server side only (firestore.rules deny every client
// read and write on these collections):
//   knowledgeNotes/{id}        the owner's notes
//   askLog/{id}                one doc per exchange (never the photo)
//   askUsage/{uid}_{day}       questions a rep asked on a Chicago day
//   askUsage/{uid}_{day}_practice   Practice model calls that day (its own count: homeowner, line judge, coach)
//   askUsage/{uid}_{day}_practice_voice   Practice lines spoken by the TTS voice that day
//   practiceLog/{id}           one doc per finished Practice (with its feedback)
//   practiceSessions/{uid}     the rep's current Practice: who is behind the door (hidden from the rep)
//   practiceAssignments/{id}   the owner's "N sessions by <day>" asks, for one rep or everyone
//   practiceCorrections/{id}   the owner's "Coach was wrong" takes; the coach reads the latest as calibration

export const ASK_LOG = 'askLog';
export const ASK_USAGE = 'askUsage';
export const ASK_DAILY_LIMIT = 60;
export const PRACTICE_LOG = 'practiceLog';
export const PRACTICE_SESSIONS = 'practiceSessions';
export const PRACTICE_ASSIGNMENTS = 'practiceAssignments';
export const PRACTICE_CORRECTIONS = 'practiceCorrections';
/**
 * Practice model calls a rep may make in a day: a knock is 1, each rep line 2
 * (the homeowner and the line judge), feedback 1 (2 with a format retry).
 * About 150 lines of pitching.
 */
export const PRACTICE_DAILY_LIMIT = 300;
/** Homeowner lines read aloud by the TTS voice: at most one per homeowner line, plus a few replays. */
export const PRACTICE_VOICE_DAILY_LIMIT = 150;

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

/**
 * Counts `calls` Practice model calls against the rep's day, on its own
 * counter (practicing never uses up Ask questions); false, and nothing
 * counted, when they and `headroom` more don't fit under PRACTICE_DAILY_LIMIT.
 */
export function takeDailyPractice(
  db: FirebaseFirestore.Firestore,
  uid: string,
  now: Date,
  calls: number,
  headroom = 0
): Promise<boolean> {
  return takeDaily(db, uid, now, '_practice', PRACTICE_DAILY_LIMIT, calls, headroom);
}

/** Practice's spoken lines, on a counter of their own so talk mode never eats into practice replies. */
export function takeDailyPracticeVoice(db: FirebaseFirestore.Firestore, uid: string, now: Date): Promise<boolean> {
  return takeDaily(db, uid, now, '_practice_voice', PRACTICE_VOICE_DAILY_LIMIT);
}

async function takeDaily(
  db: FirebaseFirestore.Firestore,
  uid: string,
  now: Date,
  suffix: string,
  limit: number,
  count = 1,
  headroom = 0
): Promise<boolean> {
  const day = chicagoDayKey(now);
  const ref = db.collection(ASK_USAGE).doc(`${uid}_${day}${suffix}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number(snap.get('count')) || 0 : 0;
    if (used + count + headroom > limit) return false;
    tx.set(ref, { uid, day, count: used + count, updatedAt: now });
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

/** Every practice assignment the owner has set, newest first (a handful: the owner deletes old ones). */
export async function loadAssignments(db: FirebaseFirestore.Firestore): Promise<PracticeAssignment[]> {
  const snap = await db.collection(PRACTICE_ASSIGNMENTS).orderBy('createdAt', 'desc').limit(200).get();
  return snap.docs.flatMap((doc) => {
    const data = doc.data();
    const createdAt = isoTime(data.createdAt);
    const persona = data.persona === 'any' ? 'any' : isPersonaId(data.persona) ? data.persona : null;
    if (!createdAt || !persona || !Number.isInteger(data.count) || typeof data.due !== 'string') return [];
    return [
      {
        id: doc.id,
        repUid: typeof data.repUid === 'string' ? data.repUid : null,
        repName: typeof data.repName === 'string' ? data.repName : '',
        persona,
        count: data.count as number,
        due: data.due,
        createdAt,
      },
    ];
  });
}

/** Finished practices since `since`, as assignments count them: one rep's, or everyone's. */
export async function loadCountedSessions(
  db: FirebaseFirestore.Firestore,
  since: Date,
  uid: string | null
): Promise<CountedSession[]> {
  const base = db.collection(PRACTICE_LOG);
  const query = uid ? base.where('uid', '==', uid).where('createdAt', '>=', since) : base.where('createdAt', '>=', since);
  const snap = await query.limit(2000).get();
  return snap.docs.flatMap((doc) => {
    const data = doc.data();
    const createdAt = isoTime(data.createdAt);
    return createdAt && typeof data.uid === 'string'
      ? [{ uid: data.uid, persona: typeof data.persona === 'string' ? data.persona : '', createdAt, redo: typeof data.redoOf === 'string' }]
      : [];
  });
}

/** The owner's latest corrections to the coach, newest first, for its prompt. */
export async function loadCorrections(db: FirebaseFirestore.Firestore): Promise<CoachCorrection[]> {
  const snap = await db.collection(PRACTICE_CORRECTIONS).orderBy('createdAt', 'desc').limit(CORRECTIONS_IN_PROMPT).get();
  return snap.docs.flatMap((doc) => {
    const data = doc.data();
    const part = CORRECTION_PARTS.find((candidate) => candidate === data.part);
    if (!part || typeof data.take !== 'string' || !data.take) return [];
    return [
      {
        part,
        original: typeof data.original === 'string' ? data.original : '',
        take: data.take,
        personaLabel: typeof data.personaLabel === 'string' ? data.personaLabel : '',
      },
    ];
  });
}
