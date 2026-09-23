import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import type { OrderSale } from '@/lib/sales/installDateSync';
import type { CarrierNoticeCounts, FiberOrder } from '@/types/fiberOrder';
import {
  groupCarrierNotices,
  planCarrierNotices,
  type CarrierNotice,
  type StoredOrder,
} from './carrierNotice';

// Tells a rep when the carrier report breaks their sale: a missed install, a
// carrier cancel, a disconnect. Which orders qualify and the words are
// carrierNotice.ts; this file reads the orders as stored before the report
// lands, claims each notice once on its fiberOrders doc, and sends.
//
// Everything here is a follow-up to a report that already landed, so nothing
// throws at the webhook: failures are logged and counted.

const READ_CHUNK = 300;
const CLAIM_CHUNK = 20;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The report's orders as stored BEFORE this report's upsert: their status and
 * the issue already told. Call it before writing the orders. null when the read
 * fails; with no before, no transition can be told apart, so nothing is sent.
 */
export async function readStoredOrders(
  orders: readonly FiberOrder[]
): Promise<Map<string, StoredOrder> | null> {
  if (!adminDb) {
    console.error('[carrierNotices] database not configured');
    return null;
  }
  try {
    const collection = adminDb.collection('fiberOrders');
    const stored = new Map<string, StoredOrder>();
    for (let offset = 0; offset < orders.length; offset += READ_CHUNK) {
      const refs = orders.slice(offset, offset + READ_CHUNK).map((order) => collection.doc(order.id));
      for (const snapshot of await adminDb.getAll(...refs)) {
        if (!snapshot.exists) continue;
        const data = snapshot.data() ?? {};
        stored.set(snapshot.id, {
          status: text(data.status),
          noticeStatus: text(data.carrierNotice?.status),
        });
      }
    }
    return stored;
  } catch (error) {
    console.error('[carrierNotices] failed to read stored orders', error);
    return null;
  }
}

/**
 * Marks the order told about this status, unless an earlier delivery of a
 * report already did. The transaction is what makes a report Postmark delivers
 * twice at once tell the rep once.
 */
async function claim(notice: CarrierNotice, now: Date): Promise<boolean> {
  const db = adminDb!;
  const ref = db.collection('fiberOrders').doc(notice.orderId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    if (text(snapshot.get('carrierNotice')?.status) === notice.status) return false;
    transaction.update(ref, { carrierNotice: { status: notice.status, at: now.toISOString() } });
    return true;
  });
}

export interface SendCarrierNoticesInput {
  orders: readonly FiberOrder[];
  /** readStoredOrders, taken before the upsert. */
  stored: ReadonlyMap<string, StoredOrder>;
  /** installDateSync's order → sale join; empty when it could not run. */
  orderSales: ReadonlyMap<string, OrderSale>;
  now?: Date;
}

export async function sendCarrierNotices(input: SendCarrierNoticesInput): Promise<CarrierNoticeCounts> {
  const counts: CarrierNoticeCounts = { found: 0, alreadySent: 0, sent: 0, summarized: 0, errors: 0 };
  const now = input.now ?? new Date();
  const notices = planCarrierNotices(input);
  counts.found = notices.length;
  if (!notices.length) return counts;
  if (!adminDb) {
    console.error('[carrierNotices] database not configured');
    return counts;
  }

  // Claim before sending: a claim that fails sends nothing, so a rep can miss
  // one notice but is never told the same thing twice.
  const claimed: CarrierNotice[] = [];
  for (let offset = 0; offset < notices.length; offset += CLAIM_CHUNK) {
    const chunk = notices.slice(offset, offset + CLAIM_CHUNK);
    const results = await Promise.allSettled(chunk.map((notice) => claim(notice, now)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[carrierNotices] failed to claim order ${chunk[index].orderId}`, result.reason);
        counts.errors += 1;
      } else if (result.value) {
        claimed.push(chunk[index]);
      } else {
        counts.alreadySent += 1;
      }
    });
  }

  for (const dispatch of groupCarrierNotices(claimed)) {
    try {
      // In-app + push only, like the install-date notice.
      await dispatchToUser({
        userId: dispatch.userId,
        type: 'carrier_order_issue',
        title: dispatch.title,
        message: dispatch.message,
        link: dispatch.link,
        metadata: { orderIds: dispatch.orderIds },
      });
      counts.sent += 1;
      if (dispatch.summary) counts.summarized += 1;
    } catch (error) {
      console.error(`[carrierNotices] failed to notify ${dispatch.userId}`, error);
      counts.errors += 1;
    }
  }
  return counts;
}
