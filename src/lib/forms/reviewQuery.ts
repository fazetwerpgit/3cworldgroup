import { adminDb } from '@/lib/firebase/admin';
import { requireManagement } from '@/lib/auth/requireManagement';

// Management-gated fetch of a form's submissions, newest first, timestamps
// serialized to Dates so NextResponse.json yields ISO strings.
export async function reviewQuery(
  collection: string,
  requestedBy: string | null
): Promise<
  | { ok: true; submissions: Record<string, unknown>[] }
  | { ok: false; error: string; status: number }
> {
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };

  const gate = await requireManagement(requestedBy);
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
