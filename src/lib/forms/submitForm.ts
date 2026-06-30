import { adminDb } from '@/lib/firebase/admin';

// Writes a rep-form submission, stamped with the VERIFIED rep identity (uid/name/
// email come from a verified Firebase token via the route, never from client input)
// and a 'new' status.
export async function submitFormRecord(
  collection: string,
  rep: { uid: string; name: string; email: string },
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  if (!adminDb) throw new Error('Database not configured');

  const now = new Date();
  const ref = await adminDb.collection(collection).add({
    ...fields,
    repUid: rep.uid,
    repName: rep.name,
    repEmail: rep.email,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id };
}
