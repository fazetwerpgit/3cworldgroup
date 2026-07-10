import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

const BATCH_LIMIT = 500;

// Every form that uses submitFormRecord receives the same repUid/repName
// identity stamp. Keep this list explicit so a newly added form collection
// cannot be missed silently.
const FORM_SUBMISSION_COLLECTIONS = [
  'fiberReports',
  'expediteOrders',
  'payrollDisputes',
  'leadsRequests',
  'managerInterviews',
  'bugReports',
] as const;

interface RestampTarget {
  collection: string;
  uidField: string;
  nameField: string;
}

const RESTAMP_TARGETS: RestampTarget[] = [
  { collection: 'sales', uidField: 'salesRepId', nameField: 'salesRepName' },
  ...FORM_SUBMISSION_COLLECTIONS.map((collection) => ({
    collection,
    uidField: 'repUid',
    nameField: 'repName',
  })),
  { collection: 'scheduledCalls', uidField: 'createdBy', nameField: 'createdByName' },
];

async function restampCollection(
  target: RestampTarget,
  uid: string,
  displayName: string
): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = adminDb
      .collection(target.collection)
      .where(target.uidField, '==', uid)
      .orderBy(FieldPath.documentId())
      .limit(BATCH_LIMIT);
    // startAfter must receive the last DocumentSnapshot, not its id. A bare id
    // is not a valid cursor when the query is ordered by document ID.
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    const batch = adminDb.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, { [target.nameField]: displayName });
    }
    await batch.commit();

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_LIMIT) break;
  }
}

// Re-stamps every known denormalized display-name copy for a user. Queries use
// one equality filter plus document-ID ordering so pagination stays stable and
// does not require a new composite Firestore index.
export async function restampDisplayName(
  uid: string,
  displayName: string
): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  if (!uid || !displayName) return;

  for (const target of RESTAMP_TARGETS) {
    await restampCollection(target, uid, displayName);
  }
}
