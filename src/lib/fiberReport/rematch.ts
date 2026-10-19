import { adminDb } from '@/lib/firebase/admin';
import { buildNameIndex, matchOrder, nameMatchUsers } from '@/lib/fiberReport/matchReps';
import { invalidateFiberOrdersCache } from '@/lib/fiberReport/ordersCache';
import { handoffOwner, readHandoffs, saleDays } from '@/lib/fiberReport/dealerHandoff';

const BATCH_SIZE = 450;

type PlacedRow = {
  repDealerId: string;
  orderDate: string | null;
  estInstallDate: string | null;
  address: string | null;
  unit: string | null;
};

function placedRow(data: FirebaseFirestore.DocumentData | undefined): PlacedRow {
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    repDealerId: typeof data?.repDealerId === 'string' ? data.repDealerId.trim() : '',
    orderDate: text(data?.orderDate),
    estInstallDate: text(data?.estInstallDate),
    address: text(data?.address),
    unit: text(data?.unit),
  };
}

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
  // Same owner rule as the import and assignDealerToUser: a handoff that
  // covers the order's day gives it to the borrower, not the code's owner.
  const handoffs = readHandoffs(mapSnapshot.data()?.handoffs);

  // nameMatchUsers leaves out demo, pending and inactive accounts.
  const usersSnapshot = await adminDb.collection('users').get();
  const userEntries = nameMatchUsers(usersSnapshot.docs);
  const nameIndex = buildNameIndex(userEntries);

  const snapshot = await adminDb.collection('fiberOrders').where('matchedUserId', '==', null).get();
  const updatedAt = new Date().toISOString();
  const updates = new Map<string, string>();
  let learnedDealerMap = false;

  // An undated (breakage) row is dated by its sale's order date, as in the
  // import: read the dated rows on any handed-off code it sits on.
  const rows = snapshot.docs.map((order) => placedRow(order.data()));
  const undatedCodes = [
    ...new Set(rows.filter((row) => !row.orderDate && handoffs[row.repDealerId]).map((row) => row.repDealerId)),
  ];
  const datedRows: PlacedRow[] = [];
  for (const code of undatedCodes) {
    const onCode = await adminDb.collection('fiberOrders').where('repDealerId', '==', code).get();
    for (const doc of onCode.docs) {
      const row = placedRow(doc.data());
      if (row.orderDate) datedRows.push(row);
    }
  }
  const sold = saleDays([...rows, ...datedRows]);

  for (const [index, order] of snapshot.docs.entries()) {
    const data = order.data();
    const row = rows[index];
    const repDealerId = row.repDealerId;
    const repName = typeof data?.repName === 'string' ? data.repName : '';
    const byCode = matchOrder({ repDealerId, repName }, dealerMap, nameIndex, userEntries);
    if (byCode && repDealerId && !dealerMap[repDealerId]) {
      dealerMap[repDealerId] = byCode;
      learnedDealerMap = true;
    }
    const userId = handoffOwner(row, handoffs, sold.get(row)) ?? byCode;
    if (!userId) continue;
    updates.set(order.id, userId);
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

  // Same reason as assignDealerToUser: matchedUserId moved under the cache.
  if (updates.size > 0) await invalidateFiberOrdersCache();
  return { updated: updates.size, stillUnmatched: snapshot.docs.length - updates.size };
}
