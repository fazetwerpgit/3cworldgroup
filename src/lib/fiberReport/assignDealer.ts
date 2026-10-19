import { adminDb } from '@/lib/firebase/admin';
import { invalidateFiberOrdersCache } from '@/lib/fiberReport/ordersCache';
import { handoffOwner, readHandoffs, saleDays } from '@/lib/fiberReport/dealerHandoff';

const BATCH_SIZE = 450;

// Map a report dealer id to a portal user and backfill every existing
// fiberOrder for that dealer. Shared by the admin assign API and the
// token-gated ops health route.
export async function assignDealerToUser(
  dealerId: string,
  userId: string,
): Promise<{ ok: true; updated: number } | { ok: false; error: string; status: number }> {
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };
  const trimmedDealerId = dealerId.trim();
  const trimmedUserId = userId.trim();
  if (!trimmedDealerId || !trimmedUserId) {
    return { ok: false, error: 'Invalid request body', status: 400 };
  }

  const targetUser = await adminDb.collection('users').doc(trimmedUserId).get();
  if (!targetUser.exists) return { ok: false, error: 'User not found', status: 404 };

  const configRef = adminDb.collection('config').doc('fiberRepMap');
  const mapSnapshot = await configRef.get();
  const rawMap = mapSnapshot.data()?.map;
  const dealerMap: Record<string, string> =
    typeof rawMap === 'object' && rawMap !== null && !Array.isArray(rawMap)
      ? Object.fromEntries(
          Object.entries(rawMap).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
      : {};
  dealerMap[trimmedDealerId] = trimmedUserId;
  await configRef.set({ map: dealerMap }, { merge: true });
  // Orders a handoff gives to someone else stay theirs.
  const handoffs = readHandoffs(mapSnapshot.data()?.handoffs);

  const snapshot = await adminDb
    .collection('fiberOrders')
    .where('repDealerId', '==', trimmedDealerId)
    .get();
  const updatedAt = new Date().toISOString();
  const rows = snapshot.docs.map((order) => {
    const data = order.data();
    return {
      repDealerId: trimmedDealerId,
      orderDate: data.orderDate ?? null,
      estInstallDate: data.estInstallDate ?? null,
      address: data.address ?? null,
      unit: data.unit ?? null,
    };
  });
  const sold = saleDays(rows);
  for (let offset = 0; offset < snapshot.docs.length; offset += BATCH_SIZE) {
    const batch = adminDb.batch();
    snapshot.docs.slice(offset, offset + BATCH_SIZE).forEach((order, index) => {
      const row = rows[offset + index];
      const owner = handoffOwner(row, handoffs, sold.get(row)) ?? trimmedUserId;
      batch.update(order.ref, { matchedUserId: owner, updatedAt });
    });
    await batch.commit();
  }
  // The admin board reads fiberOrders from a module cache; this backfill just
  // changed matchedUserId on every order of the dealer.
  await invalidateFiberOrdersCache();
  return { ok: true, updated: snapshot.docs.length };
}
