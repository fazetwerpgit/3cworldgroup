import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { KNOWLEDGE_NOTES, validateNoteDraft } from '@/lib/ask/notes';

// PATCH  /api/portal/knowledge/{id} { title, body } — edit one Ask 3C note.
// DELETE /api/portal/knowledge/{id}                — remove it. Owner only.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

async function noteRef(request: NextRequest, params: Promise<{ id: string }>) {
  const gate = await requireOwner(request);
  if (!gate.ok) return { error: fail(gate.error, gate.status) } as const;
  if (!adminDb) return { error: fail('Database not configured', 500) } as const;
  const { id } = await params;
  // Notes are Firestore auto ids.
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return { error: fail('Note not found', 404) } as const;
  const ref = adminDb.collection(KNOWLEDGE_NOTES).doc(id);
  if (!(await ref.get()).exists) return { error: fail('Note not found', 404) } as const;
  return { ref, name: gate.name } as const;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const found = await noteRef(request, params);
  if ('error' in found) return found.error;
  const checked = validateNoteDraft(await request.json().catch(() => null));
  if (!checked.ok) return fail(checked.error, 400);
  await found.ref.update({ ...checked.note, updatedAt: new Date(), updatedBy: found.name });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const found = await noteRef(request, params);
  if ('error' in found) return found.error;
  await found.ref.delete();
  return NextResponse.json({ ok: true });
}
