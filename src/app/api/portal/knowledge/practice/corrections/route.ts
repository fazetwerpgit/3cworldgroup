import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { CORRECTION_PARTS, MAX_CORRECTION_CHARS, feedbackPart } from '@/lib/ask/practiceCoaching';
import { PRACTICE_CORRECTIONS, PRACTICE_LOG } from '@/lib/ask/store';

// /api/portal/knowledge/practice/corrections: "Coach was wrong". The owner
// picks a part of one session's feedback and writes the right take; the coach
// reads the latest ones as calibration (see correctionsBlock). Owner only.
//   POST { logId, part, take }   answers { id }
//   DELETE ?id=

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);

  const body = (await request.json().catch(() => null)) as { logId?: unknown; part?: unknown; take?: unknown } | null;
  const part = CORRECTION_PARTS.find((candidate) => candidate === body?.part);
  const take = typeof body?.take === 'string' ? body.take.trim() : '';
  if (!part) return fail('Pick the part the coach got wrong.', 400);
  if (!take) return fail('Write what the coach should have said.', 400);
  if (take.length > MAX_CORRECTION_CHARS) return fail(`Keep it under ${MAX_CORRECTION_CHARS} characters.`, 400);
  if (typeof body?.logId !== 'string' || !body.logId || body.logId.includes('/')) return fail('Bad session', 400);

  const logged = (await adminDb.collection(PRACTICE_LOG).doc(body.logId).get()).data();
  if (!logged) return fail('That session is gone.', 404);
  const ref = await adminDb.collection(PRACTICE_CORRECTIONS).add({
    logId: body.logId,
    part,
    original: feedbackPart(typeof logged.feedback === 'string' ? logged.feedback : '', part),
    take,
    personaLabel: typeof logged.personaLabel === 'string' ? logged.personaLabel : '',
    repName: typeof logged.repName === 'string' ? logged.repName : '',
    by: gate.uid,
    createdAt: new Date(),
  });
  return NextResponse.json({ id: ref.id });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const id = request.nextUrl.searchParams.get('id');
  if (!id || id.includes('/')) return fail('Bad correction', 400);
  await adminDb.collection(PRACTICE_CORRECTIONS).doc(id).delete();
  return NextResponse.json({ ok: true });
}
