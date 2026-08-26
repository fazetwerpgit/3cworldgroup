import { adminDb } from '@/lib/firebase/admin';
import { buildNameIndex, matchOrder } from '@/lib/fiberReport/matchReps';

const BATCH_SIZE = 450;

// Re-run rep matching over every unmatched fiberOrder using the current users,
// dealer map, and matching rules. Shared by the admin assign API and the
// token-gated ops health route.
export async function rematchUnmatchedOrders(): Promise<{ updated: number; stillUnmatched: number }> {
  if (!adminDb) throw new Error('Database not configured');

  const configRef = adminDb.collection('config').doc('fiberRepMap');
  const mapSnapshot = await configRef.get();
  const rawMap = mapSnapshot.data()?.map;
  const dealerMap: Record<string, string> =
    typeof rawMap === 'object' && rawMap !== null && !Array.isArray(rawMap)
      ? Object.fromEntries(
          Object.entries(rawMap).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
      : {};

  const usersSnapshot = await adminDb.collection('users').get();
  const userEntries = usersSnapshot.docs.map((user) => ({
    uid: user.id,
    displayName: user.data()?.displayName,
  }));
  const nameIndex = buildNameIndex(userEntries);

  const snapshot = await adminDb.collection('fiberOrders').where('matchedUserId', '==', null).get();
  const updatedAt = new Date().toISOString();
  const updates = new Map<string, string>();
  let learnedDealerMap = false;
  for (const order of snapshot.docs) {
    const data = order.data();
    const repDealerId = typeof data?.repDealerId === 'string' ? data.repDealerId.trim() : '';
    const repName = typeof data?.repName === 'string' ? data.repName : '';
    const userId = matchOrder({ repDealerId, repName }, dealerMap, nameIndex, userEntries);
    if (!userId) continue;
    updates.set(order.id, userId);
    if (repDealerId && !dealerMap[repDealerId]) {
      dealerMap[repDealerId] = userId;
      learnedDealerMap = true;
    }
  }

  const matchedDocs = snapshot.docs.filter((order) => updates.has(order.id));
  for (let offset = 0; offset < matchedDocs.length; offset += BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const order of matchedDocs.slice(offset, offset + BATCH_SIZE)) {
      batch.update(order.ref, { matchedUserId: updates.get(order.id), updatedAt });
    }
    await batch.commit();
  }
  // `dealerMap` is the complete map, so a shallow merge cannot erase older
  // mappings when rematch learns a new dealer id.
  if (learnedDealerMap) await configRef.set({ map: dealerMap }, { merge: true });

  return { updated: updates.size, stillUnmatched: snapshot.docs.length - updates.size };
}
