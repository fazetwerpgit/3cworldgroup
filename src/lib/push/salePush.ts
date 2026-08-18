import { PushPayload } from './sendPush';

// The push a rep gets when their pending sale is decided. Kept separate from the
// in-app notification copy in the approve route: a lock-screen notification has to
// name the customer up front, because there is no surrounding context to read.
export function buildSaleDecisionPush(
  status: 'approved' | 'rejected',
  saleData: FirebaseFirestore.DocumentData | undefined,
  rejectionReason?: unknown
): PushPayload {
  const rawName = typeof saleData?.customerName === 'string' ? saleData.customerName.trim() : '';
  // Falls back to the address, which is the one customer field a sale always has.
  const rawAddress = typeof saleData?.customerAddress === 'string' ? saleData.customerAddress.trim() : '';
  const customer = rawName || rawAddress || 'Your sale';

  if (status === 'approved') {
    return { title: 'Sale approved', body: `${customer} — approved`, url: '/portal/sales' };
  }

  const reason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';
  return {
    title: 'Sale rejected',
    body: `${customer} — ${reason || 'rejected'}`,
    url: '/portal/sales',
  };
}
