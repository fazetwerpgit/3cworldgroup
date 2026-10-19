import { adminDb } from '@/lib/firebase/admin';
import { DEMO_ACCOUNT_FIELD } from '@/lib/users/demoAccount';

/**
 * Status of a form a demo account (App Review) sends. Not 'new', so it never
 * reaches the review queues' unhandled list or the owner "Needs attention"
 * count (both read status == 'new'); the `demoAccount` stamp drops it from the
 * rest of the review list (reviewQuery). Same rule as demo sales.
 */
export const DEMO_FORM_STATUS = 'demo';

// Writes a rep-form submission, stamped with the VERIFIED rep identity (uid/name/
// email come from a verified Firebase token via the route, never from client input)
// and a 'new' status. A demo account's form is stamped `demoAccount: true` with
// DEMO_FORM_STATUS instead, so nobody else ever sees it.
export async function submitFormRecord(
  collection: string,
  rep: { uid: string; name: string; email: string; demoAccount?: boolean },
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  if (!adminDb) throw new Error('Database not configured');

  const now = new Date();
  const demo = rep.demoAccount === true;
  const ref = await adminDb.collection(collection).add({
    ...fields,
    repUid: rep.uid,
    repName: rep.name,
    repEmail: rep.email,
    ...(demo ? { [DEMO_ACCOUNT_FIELD]: true } : {}),
    status: demo ? DEMO_FORM_STATUS : 'new',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id };
}
