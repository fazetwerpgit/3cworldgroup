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

/** Newest handled history kept in a review list; unhandled ('new') items are never capped. */
export const REVIEW_RECENT_LIMIT = 200;

type ReviewDoc = { id: string; data: () => Record<string, unknown> };

function toSubmission(d: ReviewDoc): Record<string, unknown> & { createdAt: Date | null } {
  const data = d.data() as Record<string, unknown> & {
    createdAt?: { toDate(): Date } | null;
    updatedAt?: { toDate(): Date } | null;
  };
  return {
    ...data,
    id: d.id,
    createdAt: data.createdAt?.toDate() ?? null,
    updatedAt: data.updatedAt?.toDate() ?? null,
  };
}

// Merges the newest-N page with every unhandled doc (deduped by id), newest first.
// The New view and the owner "Needs attention" count (status == 'new') then agree,
// however old an unhandled item is.
export function mergeReviewDocs(recent: ReviewDoc[], unhandled: ReviewDoc[]): Record<string, unknown>[] {
  const byId = new Map<string, ReturnType<typeof toSubmission>>();
  for (const d of [...unhandled, ...recent]) {
    if (!byId.has(d.id)) byId.set(d.id, toSubmission(d));
  }
  return [...byId.values()].sort(
    (a, b) => (b.createdAt?.getTime() ?? -Infinity) - (a.createdAt?.getTime() ?? -Infinity)
  );
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

  const col = adminDb.collection(collection);
  // Equality-only filter: no composite index needed. Sorted after the merge.
  const [recent, unhandled] = await Promise.all([
    col.orderBy('createdAt', 'desc').limit(REVIEW_RECENT_LIMIT).get(),
    col.where('status', '==', 'new').get(),
  ]);
  return { ok: true, submissions: mergeReviewDocs(recent.docs, unhandled.docs) };
}
