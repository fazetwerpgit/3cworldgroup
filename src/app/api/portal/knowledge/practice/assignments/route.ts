import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { unrankedReps } from '@/lib/leaderboard/team';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { PERSONAS } from '@/lib/ask/practice';
import { assignmentDone, parseAssignment, type AssignmentView } from '@/lib/ask/practiceCoaching';
import { PRACTICE_ASSIGNMENTS, loadAssignments, loadCountedSessions } from '@/lib/ask/store';

// /api/portal/knowledge/practice/assignments: the owner's practice asks,
// "N sessions with <homeowner type or any> by <day>", for one rep or every
// active rep. Owner only.
//   GET                                  every assignment with each rep's count, and the reps to pick from
//   POST { repUid|'all', persona|'any', count, due: 'YYYY-MM-DD' }
//   DELETE ?id=

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Active field reps with a name, A to Z: who "everyone" means. */
async function activeReps(db: FirebaseFirestore.Firestore): Promise<{ uid: string; name: string }[]> {
  const snap = await db.collection('users').where('status', '==', 'active').get();
  return unrankedReps(
    snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
    new Set()
  ).map((rep) => ({ uid: rep.salesRepId, name: rep.salesRepName }));
}

export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  const [assignments, reps] = await Promise.all([loadAssignments(db), activeReps(db)]);
  const oldest = assignments.reduce((min, assignment) => (assignment.createdAt < min ? assignment.createdAt : min), new Date().toISOString());
  const sessions = assignments.length ? await loadCountedSessions(db, new Date(oldest), null) : [];
  const views: AssignmentView[] = assignments.map((assignment) => {
    const who = assignment.repUid ? [{ uid: assignment.repUid, name: assignment.repName }] : reps;
    return {
      ...assignment,
      personaLabel: assignment.persona === 'any' ? 'any homeowner' : (PERSONAS.find((p) => p.id === assignment.persona)?.label ?? ''),
      reps: who.map((rep) => ({ ...rep, done: Math.min(assignment.count, assignmentDone(assignment, sessions, rep.uid)) })),
    };
  });
  return NextResponse.json({ assignments: views, reps });
}

export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  const now = new Date();
  const parsed = parseAssignment(await request.json().catch(() => null), chicagoDayKey(now));
  if (!parsed.ok) return fail(parsed.error, 400);
  let repName = 'Everyone';
  if (parsed.value.repUid) {
    const rep = (await activeReps(db)).find((candidate) => candidate.uid === parsed.value.repUid);
    if (!rep) return fail('That rep is not active.', 400);
    repName = rep.name;
  }
  const ref = await db.collection(PRACTICE_ASSIGNMENTS).add({ ...parsed.value, repName, by: gate.uid, createdAt: now });
  return NextResponse.json({ id: ref.id });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const id = request.nextUrl.searchParams.get('id');
  if (!id || id.includes('/')) return fail('Bad assignment', 400);
  await adminDb.collection(PRACTICE_ASSIGNMENTS).doc(id).delete();
  return NextResponse.json({ ok: true });
}
