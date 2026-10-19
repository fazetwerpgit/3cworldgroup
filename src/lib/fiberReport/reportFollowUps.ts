// The carrier report's follow-ups, after its orders are stored: the carrier's
// install dates pushed onto the sales, the rep notices, the overdue alerts and
// the unlogged-order nudges. Each step is fail-soft (a report that landed must
// never be failed by a follow-up) and reports its counts through `progress` as
// soon as it finishes, so the import log says how far a run got even when the
// function is cut off by its time limit partway through.

import type { Firestore } from 'firebase-admin/firestore';
import type {
  CarrierNoticeCounts,
  FiberOrder,
  FiberReportImport,
  FiberReportImportStage,
  InstallDateSyncCounts,
  OverdueAlertCounts,
  UnloggedOrderNudgeCounts,
} from '@/types/fiberOrder';
import { syncInstallDatesFromOrders, type OrderSale } from '@/lib/sales/installDateSync';
import { sendCarrierNotices, type readStoredOrders } from '@/lib/fiberReport/carrierNotices';
import { runOverdueInstallAlerts } from '@/lib/alerts/installOverdueAlerts';
import { runUnloggedOrderNudges } from '@/lib/alerts/unloggedOrderNudges';
import { markLeaderboardDirty } from '@/lib/leaderboard/snapshotStore';

export type FollowUpProgress = (
  stage: FiberReportImportStage,
  values: Partial<Pick<FiberReportImport, 'installDateSync' | 'carrierNotices' | 'overdueAlerts' | 'unloggedOrderNudges'>>
) => Promise<void>;

export interface FollowUpResult {
  installDateSync: InstallDateSyncCounts | null;
  carrierNotices: CarrierNoticeCounts | null;
  overdueAlerts: OverdueAlertCounts | null;
  unloggedOrderNudges: UnloggedOrderNudgeCounts | null;
}

async function safely(progress: FollowUpProgress, stage: FiberReportImportStage, values: Parameters<FollowUpProgress>[1]) {
  try {
    await progress(stage, values);
  } catch (error) {
    console.error(`[inbound-report] failed to record stage ${stage}`, error);
  }
}

export async function runReportFollowUps(input: {
  db: Firestore;
  orders: FiberOrder[];
  storedOrders: Awaited<ReturnType<typeof readStoredOrders>>;
  progress: FollowUpProgress;
  now?: () => Date;
}): Promise<FollowUpResult> {
  const now = input.now ?? (() => new Date());
  const result: FollowUpResult = { installDateSync: null, carrierNotices: null, overdueAlerts: null, unloggedOrderNudges: null };

  let orderSales = new Map<string, OrderSale>();
  try {
    const { changes, orderSales: linked, ...counts } = await syncInstallDatesFromOrders({ orders: input.orders, now: now() });
    result.installDateSync = counts;
    orderSales = linked;
    if (changes.length) {
      console.log(`[inbound-report] moved ${changes.length} install date(s) from the report`);
    }
    if (counts.orderNumbersFilled || counts.orderNumberSkippedConflict) {
      console.log(
        `[inbound-report] filled ${counts.orderNumbersFilled} order number(s) from the report; ${counts.orderNumberSkippedConflict} left empty (number already on another live sale, or another rep's row)`
      );
    }
    // Install dates and order numbers feed the board's carrier join.
    await markLeaderboardDirty();
  } catch (error) {
    console.error('[inbound-report] install date sync failed', error);
  }
  await safely(input.progress, 'installDateSync', { installDateSync: result.installDateSync });

  // Missed installs, carrier cancels and disconnects, told to the rep once.
  if (input.storedOrders) {
    try {
      result.carrierNotices = await sendCarrierNotices({ orders: input.orders, stored: input.storedOrders, orderSales, now: now() });
    } catch (error) {
      console.error('[inbound-report] carrier notices failed', error);
    }
  }
  await safely(input.progress, 'carrierNotices', { carrierNotices: result.carrierNotices });

  // Installs still open 3+ days past their day: the rep on day 3 and then
  // weekly, the owners once a day. Read after the date sync, so a sale it
  // just moved to a future day is not told. Once per sale per day however
  // many times the report is delivered (claims in installOverdueAlerts).
  try {
    result.overdueAlerts = (await runOverdueInstallAlerts({ db: input.db, now: now() })).counts;
  } catch (error) {
    console.error('[inbound-report] overdue install alerts failed', error);
  }
  await safely(input.progress, 'overdueAlerts', { overdueAlerts: result.overdueAlerts });

  // Live carrier orders a rep never logged (the board's "Not in the portal",
  // last 30 days): the rep is told once per order, one push per rep. Read
  // after the date sync filled order numbers, so a sale it just joined is not
  // told (claims in unloggedOrderNudges).
  try {
    result.unloggedOrderNudges = (await runUnloggedOrderNudges({ db: input.db, now: now() })).counts;
  } catch (error) {
    console.error('[inbound-report] unlogged order nudges failed', error);
  }
  await safely(input.progress, 'unloggedOrderNudges', { unloggedOrderNudges: result.unloggedOrderNudges });

  await safely(input.progress, 'done', {});
  return result;
}
