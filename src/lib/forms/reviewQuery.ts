import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

// Verified-management-gated mark-handled. Uses a transaction so concurrent clicks
// can't both flip 'new' -> 'handled'. Returns a status/error for the route.
export async function markHandled(
  collection: string,
  request: NextRequest,
  id: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };

  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return { ok: false, error: gate.error, status: gate.status };
  if (!id) return { ok: false, error: 'id is required', status: 400 };

  const ref = adminDb.collection(collection).doc(id);
  try {
    await adminDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new Error('NOT_FOUND');
      if (doc.data()?.status !== 'new') throw new Error('ALREADY_HANDLED');
      tx.update(ref, { status: 'handled', handledBy: gate.uid, updatedAt: new Date() });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'NOT_FOUND') return { ok: false, error: 'Not found', status: 404 };
    if (msg === 'ALREADY_HANDLED') return { ok: false, error: 'Already handled', status: 400 };
    return { ok: false, error: 'Failed to update', status: 500 };
  }
  return { ok: true };
}

// Verified-management-gated fetch of a form's submissions, newest first, timestamps
// serialized to Dates so NextResponse.json yields ISO strings. These lists expose
// customer PII, so they require a real Firebase token (not a client-supplied UID).
export async function reviewQuery(
  collection: string,
  request: NextRequest
): Promise<
  | { ok: true; submissions: Record<string, unknown>[] }
  | { ok: false; error: string; status: number }
> {
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };

  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return { ok: false, error: gate.error, status: gate.status };

  const snap = await adminDb.collection(collection).orderBy('createdAt', 'desc').limit(200).get();
  const submissions = snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      createdAt: data.createdAt?.toDate() ?? null,
      updatedAt: data.updatedAt?.toDate() ?? null,
    };
  });
  return { ok: true, submissions };
}
