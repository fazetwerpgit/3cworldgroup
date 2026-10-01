import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { practiceAudience } from '@/lib/ask/flag';
import { PERSONAS } from '@/lib/ask/practice';
import {
  openAssignmentsFor,
  parseDelivery,
  parseSkills,
  type MyPracticeReply,
  type MyPracticeSession,
} from '@/lib/ask/practiceCoaching';
import { PRACTICE_LOG, isoTime, loadAssignments, loadCountedSessions } from '@/lib/ask/store';

// GET /api/portal/ask/practice/mine: the rep's own practice over the last 30
// days (scores, skill scores, delivery, the coach's feedback) and the owner's
// assignments they have open, with how many they've done. Same gate as Ask 3C.

export const dynamic = 'force-dynamic';

const DAYS = 30;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  const audience = practiceAudience();
  if (audience === 'off') return fail('Ask 3C is not turned on yet.', 404);
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (audience === 'owners' && !gate.isOwner) return fail('Ask 3C is not turned on yet.', 404);
  if (!adminDb) return fail('Database not configured', 500);

  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 86_400_000);
  const [snap, assignments] = await Promise.all([
    adminDb.collection(PRACTICE_LOG).where('uid', '==', gate.uid).where('createdAt', '>=', since).limit(300).get(),
    loadAssignments(adminDb),
  ]);
  const sessions: MyPracticeSession[] = snap.docs
    .flatMap((doc) => {
      const data = doc.data();
      const createdAt = isoTime(data.createdAt);
      const feedback = typeof data.feedback === 'string' ? data.feedback : '';
      if (!createdAt) return [];
      return [
        {
          id: doc.id,
          persona: typeof data.personaLabel === 'string' ? data.personaLabel : '',
          result: typeof data.result === 'string' && data.result ? data.result : null,
          score: typeof data.score === 'number' ? data.score : null,
          skills: parseSkills(feedback),
          delivery: parseDelivery(data.delivery),
          redo: typeof data.redoOf === 'string',
          feedback,
          createdAt,
        },
      ];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Assignments count from when they were set, which may be before the 30 days.
  const today = chicagoDayKey(now);
  const mine = assignments.filter((assignment) => (assignment.repUid === null || assignment.repUid === gate.uid) && assignment.due >= today);
  const oldest = mine.reduce((min, assignment) => (assignment.createdAt < min ? assignment.createdAt : min), now.toISOString());
  const counted = mine.length ? await loadCountedSessions(adminDb, new Date(oldest), gate.uid) : [];
  const reply: MyPracticeReply = {
    sessions: sessions.slice(0, 100),
    assignments: openAssignmentsFor(gate.uid, mine, counted, today).map(({ assignment, done }) => ({
      id: assignment.id,
      persona: assignment.persona === 'any' ? 'any homeowner' : (PERSONAS.find((p) => p.id === assignment.persona)?.label ?? ''),
      count: assignment.count,
      done,
      due: assignment.due,
    })),
  };
  return NextResponse.json(reply);
}
