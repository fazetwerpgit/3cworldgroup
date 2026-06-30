import { adminDb } from '@/lib/firebase/admin';

// Writes a rep-form submission. Stamps the canonical rep identity from the user
// doc (never trusts client-supplied name/email) and a 'new' status.
export async function submitFormRecord(
  collection: string,
  repUid: string,
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  if (!adminDb) throw new Error('Database not configured');

  const userSnap = await adminDb.collection('users').doc(repUid).get();
  if (!userSnap.exists) throw new Error('Submitting user not found');
  const u = userSnap.data();

  const now = new Date();
  const ref = await adminDb.collection(collection).add({
    ...fields,
    repUid,
    repName: u?.displayName ?? u?.email ?? repUid,
    repEmail: u?.email ?? '',
    status: 'new',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id };
}
