import { adminDb } from '@/lib/firebase/admin';
import { getAllFiberOrders } from '@/lib/fiberReport/ordersCache';
import type { FiberOrder } from '@/types/fiberOrder';

// A rep's or admin's install-date edit records the carrier row the sale stood
// on at that moment (carrierOrderForSale), so the report sync can tell the
// carrier's news from the same old row the person already corrected.

/**
 * Every stored carrier order, or null when they can't be read. A failed read
 * must not cost anyone their save: with nothing on record, the next report's
 * date counts as news, as it did before these fields existed.
 */
export async function loadCarrierOrders(): Promise<FiberOrder[] | null> {
  try {
    const status = await adminDb!.collection('config').doc('fiberReportStatus').get();
    return await getAllFiberOrders(status.exists ? (status.data()?.lastReportAt ?? null) : null);
  } catch (error) {
    console.error('Error reading carrier orders for an install date edit:', error);
    return null;
  }
}
