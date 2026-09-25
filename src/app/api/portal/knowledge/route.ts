import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { KNOWLEDGE_NOTES, validateNoteDraft, type NoteDraft } from '@/lib/ask/notes';
import { loadNotes } from '@/lib/ask/store';

// GET  /api/portal/knowledge                 the owner's Ask 3C notes, in prompt order
// POST /api/portal/knowledge { notes: [...] } adds one or more notes (a typed
//      note, or every file of an upload), all or none, at the end of the order.
// Owner only. The notes are restricted carrier material: they live only here
// in Firestore (no client rules) and never in the repo.

export const dynamic = 'force-dynamic';

const MAX_NOTES_PER_POST = 50;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  return NextResponse.json({ notes: await loadNotes(adminDb) });
}

export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  const body = (await request.json().catch(() => null)) as { notes?: unknown } | null;
  const raw = body?.notes;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_NOTES_PER_POST) {
    return fail(`Send 1 to ${MAX_NOTES_PER_POST} notes`, 400);
  }
  const drafts: NoteDraft[] = [];
  for (const item of raw) {
    const checked = validateNoteDraft(item);
    if (!checked.ok) return fail(checked.error, 400);
    drafts.push(checked.note);
  }

  const existing = await loadNotes(db);
  const nextOrder = existing.reduce((max, note) => Math.max(max, note.order), 0) + 1;
  const now = new Date();
  const batch = db.batch();
  const ids = drafts.map((draft, index) => {
    const ref = db.collection(KNOWLEDGE_NOTES).doc();
    batch.set(ref, { ...draft, order: nextOrder + index, updatedAt: now, updatedBy: gate.name });
    return ref.id;
  });
  await batch.commit();
  return NextResponse.json({ ids }, { status: 201 });
}
