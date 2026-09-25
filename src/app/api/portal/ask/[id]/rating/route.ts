import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { askEnabled } from '@/lib/ask/flag';
import { ASK_LOG } from '@/lib/ask/store';

// PATCH /api/portal/ask/{id}/rating { rating: 'up' | 'down' | null } — the rep's
// thumbs on one of their own Ask 3C answers. Only the rep who asked may rate it.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!askEnabled()) return fail('Ask 3C is not turned on yet.', 404);
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);

  const { id } = await params;
  // askLog ids are Firestore auto ids.
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return fail('Not found', 404);
  const body = (await request.json().catch(() => null)) as { rating?: unknown } | null;
  const rating = body?.rating;
  if (rating !== 'up' && rating !== 'down' && rating !== null) return fail('Rating must be up, down or null', 400);

  const ref = adminDb.collection(ASK_LOG).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail('Not found', 404);
  if (snap.get('uid') !== gate.uid) return fail('Forbidden: you can only rate your own answers', 403);
  await ref.update({ rating, ratedAt: new Date() });
  return NextResponse.json({ ok: true });
}
