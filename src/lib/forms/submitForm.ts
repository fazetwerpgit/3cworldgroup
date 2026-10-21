import { adminDb } from '@/lib/firebase/admin';
import { isAlreadyExists } from '@/lib/forms/idempotency';
import { DEMO_ACCOUNT_FIELD, TEST_ACCOUNT_FIELD } from '@/lib/users/demoAccount';

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
// DEMO_FORM_STATUS instead, so nobody else ever sees it. A QA test account's
// record (solar leads) gets `testAccount: true` and keeps the normal status: it
// behaves like a real one for its rep, and the readers drop the stamp.
//
// With `clientId` (already validated, see lib/forms/idempotency.ts) the record's
// doc id is `${uid}_${clientId}` and it is written with create(), which Firestore
// rejects atomically when that doc already exists. So a resend, or two identical
// requests racing, land on one record: the loser gets `duplicate: true` and the
// original id, and the route skips the second notification.
export async function submitFormRecord(
  collection: string,
  rep: { uid: string; name: string; email: string; demoAccount?: boolean; testAccount?: boolean },
  fields: Record<string, unknown>,
  options: { clientId?: string } = {}
): Promise<{ id: string; duplicate: boolean }> {
  if (!adminDb) throw new Error('Database not configured');

  const now = new Date();
  const demo = rep.demoAccount === true;
  const record = {
    ...fields,
    repUid: rep.uid,
    repName: rep.name,
    repEmail: rep.email,
    ...(demo ? { [DEMO_ACCOUNT_FIELD]: true } : {}),
    ...(rep.testAccount === true ? { [TEST_ACCOUNT_FIELD]: true } : {}),
    status: demo ? DEMO_FORM_STATUS : 'new',
    createdAt: now,
    updatedAt: now,
  };

  const { clientId } = options;
  if (!clientId) {
    const ref = await adminDb.collection(collection).add(record);
    return { id: ref.id, duplicate: false };
  }

  const ref = adminDb.collection(collection).doc(`${rep.uid}_${clientId}`);
  try {
    await ref.create({ ...record, clientId });
    return { id: ref.id, duplicate: false };
  } catch (error) {
    if (isAlreadyExists(error)) return { id: ref.id, duplicate: true };
    throw error;
  }
}
