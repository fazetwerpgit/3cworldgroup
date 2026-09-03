'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FIBER_COMPANIES, RoleDisplayNames, isOwner } from '@/types';
import type { CompPlanCompanyRates, CompPlanRole, FiberOrder, FiberStatusResponse, Sale } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useSalePaid } from '@/hooks/useSalePaid';
import { expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { InstallBucket, InstallCounts } from '@/lib/sales/installBucket';
import { bookForMonth, buildMergedBook, type MergedBook, type MergedRow } from '@/lib/sales/mergeBook';
import { normalizeAddress } from '@/lib/fiberReport/matchSales';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { isInMonth, monthLabel, type MonthKey } from '@/lib/sales/monthWindow';
import { SaleDetailSheet } from './SaleDetailSheet';
import { LinkOrderDialog, UnassignedOrders } from './UnloggedOrders';

// The company book, for admins and owners. One row per CUSTOMER — the sales the
// reps logged and the carrier's morning report merged into a single list, so the
// page can no longer show two truths that disagree. Rows are grouped by rep: on
// a phone, thirty-one customers is a scroll nobody reads, while four reps is a
// glance. Approval is gone, so the install pipeline is the only state worth
// colouring — green landed, amber booked, red nobody has a date yet, and red
// again for the carrier's install that nobody here ever wrote down.

interface AdminSalesBoardProps {
  /** The whole book, all months. The month is applied here, not in the fetch. */
  sales: Sale[];
  /**
   * The month on the picker. Both feeds are all-time and are narrowed together
   * below — narrowing only the sales made a carrier order whose sale sat in
   * another month look like a sale nobody ever logged.
   */
  month?: MonthKey;
  /**
   * The sales fetch hit its 500 cap. Rows cut this way are missing from every
   * month AND resurface as red "never logged" rows, because their carrier
   * orders are still here — so it cannot be left silent.
   */
  truncated?: boolean;
  loading?: boolean;
  onDelete?: (saleId: string) => void | Promise<boolean>;
  /** Cancel a sale the customer backed out of, or undo that cancellation. */
  onSetCancelled?: (saleId: string, cancelled: boolean, reason?: string) => void | Promise<boolean>;
  fiber?: {
    data: FiberStatusResponse | null;
    loading: boolean;
    error: string | null;
    /** Re-read the carrier report. `fresh` bypasses the server's order cache. */
    refetch?: (opts?: { fresh?: boolean }) => Promise<void>;
  };
  /** The viewer's own comp-plan slice. Admin/owner resolve to the Internal Rep scale. */
  payPlan?: {
    rates: CompPlanCompanyRates | null;
    payDelayDays: number;
    hasPlan: boolean;
    compRole: CompPlanRole | null;
  };
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Carrier dates are bare yyyy-mm-dd, which `new Date` reads as UTC midnight —
 * west of Greenwich that prints the day before. Read them at local noon, the
 * way sale and install dates are already stored.
 */
function formatCarrierDate(value: string | null | undefined) {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function productSummary(sale: Sale) {
  return (sale.products || [])
    .map((product) => {
      const provider = FIBER_COMPANIES.find((item) => item.value === product.company)?.label || product.company;
      return `${product.productName} / ${provider}`;
    })
    .join(' · ');
}

/**
 * The month reps actually started logging sales in the portal: the first sale
 * in the book is dated July 2026 (Jul 57, Aug 61, Sep 6).
 *
 * This is NOT `PORTAL_LOGGING_START` in mergeBook, which is April, and the two
 * must never be conflated. April is how far back Jacob wants to be SHOWN
 * carrier orders with no sale — a recovery window. July is the month after
 * which a missing sale is actually surprising, because a rep was demonstrably
 * using the site.
 *
 * It lives here rather than beside `PORTAL_LOGGING_START` because no merge
 * decision reads it: the merge emits one `never_logged` state and this only
 * decides which of two groups a row is printed under.
 */
export const REPS_STARTED_LOGGING = '2026-07-01';

const LOGGING_START_MONTH: MonthKey = (() => {
  const [year, month] = REPS_STARTED_LOGGING.split('-').map(Number);
  return { year, month: month - 1 };
})();

/**
 * Was this carrier order placed in a month a rep was already logging sales?
 *
 * A row with no date at all cannot be shown to be either side of the line, and
 * it is the row nobody can place — so it leads rather than being filed away in
 * the quiet pile, which is also where `bookForMonth` keeps it (every month).
 */
function afterLoggingStarted(row: MergedRow): boolean {
  if (!row.month) return true;
  return (
    row.month.year > LOGGING_START_MONTH.year ||
    (row.month.year === LOGGING_START_MONTH.year && row.month.month >= LOGGING_START_MONTH.month)
  );
}

const BUCKET_LABEL: Record<InstallBucket, string> = {
  installed: 'installed',
  scheduled: 'scheduled',
  attention: 'no date',
};

/** "5 installed · 2 scheduled · 1 no date" — a zero segment is left out entirely. */
function countsSummary(counts: InstallCounts): string {
  return (['installed', 'scheduled', 'attention'] as InstallBucket[])
    .filter((bucket) => counts[bucket] > 0)
    .map((bucket) => `${counts[bucket]} ${BUCKET_LABEL[bucket]}`)
    .join(' · ');
}

function installChip(sale: Sale, bucket: InstallBucket) {
  if (bucket === 'attention') return 'No install date';
  return `${bucket === 'installed' ? 'Installed' : 'Installs'} ${formatDate(sale.installDate)}`;
}

/** The carrier's own line for an order nobody logged: what it is and when. */
function orderLine(order: FiberOrder): string {
  const bits: string[] = [];
  if (order.fiberPlan) bits.push(order.fiberPlan);
  const activated = order.status === 'active' ? formatCarrierDate(order.activationDate) : null;
  const estimated = formatCarrierDate(order.estInstallDate);
  if (activated) bits.push(`Activated ${activated}`);
  else if (estimated) bits.push(`Install est. ${estimated}`);
  if (typeof order.mrc === 'number' && Number.isFinite(order.mrc)) {
    bits.push(`carrier ${formatMoney(order.mrc)}/mo`);
  }
  return bits.join(' · ') || 'In the carrier report';
}

/**
 * One drawer's (or one group's) slice of the book, narrowed to the month by
 * `bookForMonth` itself rather than by a second copy of its month comparison
 * living here. It only reads `rows`, so handing it a subset gives that subset's
 * own out-of-view counts — which is what "never hide a row silently" needs, per
 * group. `book.rows` is the kept subset in both branches, including the
 * all-time one where `bookForMonth` hands the book straight back.
 */
function drawerView(book: MergedBook, rows: MergedRow[], month: MonthKey | undefined) {
  const view = bookForMonth({ ...book, rows }, month ?? null);
  return { rows: view.book.rows, olderCount: view.olderCount, newerCount: view.newerCount };
}

function outOfViewLabel({ olderCount, newerCount }: { olderCount: number; newerCount: number }) {
  const parts: string[] = [];
  if (olderCount) parts.push(`+${olderCount} older`);
  if (newerCount) parts.push(`+${newerCount} newer`);
  return parts.join(' · ');
}

/**
 * The order of the link picker. The admin is answering "which sale is this",
 * and the answer is nearly always a sale the report has never mentioned, at
 * roughly this address, from around this date — so those float, and the rest
 * stay reachable underneath rather than being filtered away.
 */
function rankCandidates(rows: MergedRow[], order: FiberOrder | null): MergedRow[] {
  const target = normalizeAddress(order?.address);
  const orderTime = carrierTime(order?.orderDate ?? order?.estInstallDate ?? null);

  const score = (row: MergedRow) => {
    const address = normalizeAddress(row.address);
    let shared = 0;
    while (shared < address.length && shared < target.length && address[shared] === target[shared]) shared += 1;
    // A prefix shorter than a house number and a street word is coincidence.
    return shared >= 6 ? shared : 0;
  };

  const distance = (row: MergedRow) => {
    const sold = row.sale?.saleDate ? new Date(row.sale.saleDate as Date | string).getTime() : NaN;
    if (!orderTime || Number.isNaN(sold)) return Number.POSITIVE_INFINITY;
    return Math.abs(sold - orderTime);
  };

  return [...rows].sort((a, b) => {
    // A sale the carrier has never mentioned is the one most likely to be this
    // order; a sale that already has an order of its own is the least likely.
    const waitingA = a.state === 'waiting' ? 0 : 1;
    const waitingB = b.state === 'waiting' ? 0 : 1;
    if (waitingA !== waitingB) return waitingA - waitingB;
    const scored = score(b) - score(a);
    if (scored) return scored;
    const near = distance(a) - distance(b);
    if (Number.isFinite(near) && near) return near;
    return (a.customerName ?? a.address).localeCompare(b.customerName ?? b.address);
  });
}

/** The month a submission belongs to, or null when it carries no usable date. */
function monthOf(value: Date | string | null | undefined): MonthKey | null {
  if (!value) return null;
  const date = new Date(value as Date | string);
  return Number.isNaN(date.getTime()) ? null : { year: date.getFullYear(), month: date.getMonth() };
}

/** Newest submission first. An undated one sorts last rather than to the top. */
function saleTime(sale: Sale): number {
  if (!sale.saleDate) return 0;
  const time = new Date(sale.saleDate as Date | string).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function carrierTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function AdminSalesBoard({ sales, month, truncated, loading, onDelete, onSetCancelled, fiber, payPlan }: AdminSalesBoardProps) {
  const { user, isRole } = useAuth();
  const isAdmin = isRole('admin');
  // Owner is a tier ABOVE admin, so this cannot be a permission check — every
  // sales:read:all permission an owner has, an admin has too.
  const ownerView = isOwner(user?.role);
  // The viewer's own private "I've been paid for this" ticks — the same
  // reconciliation checkbox the rep ledger has. Nobody else can see them.
  const { paidBySale, togglePaid } = useSalePaid(user?.uid ?? null);
  const hasPlan = !!payPlan?.hasPlan;

  const [tab, setTab] = useState<'company' | 'pay'>('company');
  const [openRepId, setOpenRepId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [openDrawer, setOpenDrawer] = useState<'never' | 'unassigned' | 'cancelled' | 'historic' | null>(null);
  const [linkingRow, setLinkingRow] = useState<MergedRow | null>(null);
  const [undoingKey, setUndoingKey] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  // `now` is frozen per render pass so the bar, the sub-lines and the chips
  // can never straddle midnight and disagree about what "installed" means.
  const now = useMemo(() => new Date(), []);

  // Both halves of the carrier feed. `orders` are the ones whose dealer matched
  // a portal user; `unmatched` are the ones that did not, and they are exactly
  // the rows the unassigned drawer exists for — dropping them would delete the
  // problem from the screen rather than solve it.
  const fiberOrders = useMemo(
    () => [...(fiber?.data?.orders ?? []), ...(fiber?.data?.unmatched ?? [])],
    [fiber?.data?.orders, fiber?.data?.unmatched]
  );

  const fullBook = useMemo(
    () => buildMergedBook(sales, fiberOrders, { now }),
    [fiberOrders, now, sales]
  );
  // The sales prop is already month-bounded by the page's fetch; the carrier
  // orders are not, so the month is applied here for both and reports what it
  // is holding back rather than swallowing it.
  const { book, olderCount, newerCount } = useMemo(
    () => bookForMonth(fullBook, month ?? null),
    [fullBook, month]
  );

  const counts = book.counts;
  const countedCount = counts.installed + counts.scheduled + counts.attention;
  const monthValue = book.totalValue;

  // Drawer 1 carries the open rows and the settled ones together: a dismissal
  // is the answer to a not-logged row, so it belongs where the question was
  // asked rather than in a drawer of its own. `neverView` is the head count for
  // the whole drawer; the two groups inside it each carry their own.
  //
  // These four drawers are deliberately NOT month-scoped. A not-logged install,
  // an order with no rep, and a pre-portal order are BACKLOGS, not monthly
  // figures — nobody asks "how many were never logged in September". Scoping
  // them to the picker made every head read 0 with the real number hidden in a
  // "+211 older outside this month" aside, which is the same trap that cost
  // Connor his August sales. Only "Cancelled this month" keeps the month, and
  // its label says so.
  const neverView = useMemo(
    () => drawerView(fullBook, [...fullBook.neverLogged, ...fullBook.dismissed], undefined),
    [fullBook]
  );
  // The pile is split because mixing the two hides the only rows that matter:
  // an install missing from a month nobody was logging in says nothing, and an
  // install missing from a month a rep was working in says something.
  const sinceView = useMemo(
    () => drawerView(fullBook, fullBook.neverLogged.filter(afterLoggingStarted), undefined),
    [fullBook]
  );
  const earlierView = useMemo(
    () => drawerView(fullBook, fullBook.neverLogged.filter((row) => !afterLoggingStarted(row)), undefined),
    [fullBook]
  );
  const dismissedView = useMemo(() => drawerView(fullBook, fullBook.dismissed, undefined), [fullBook]);
  const unassignedView = useMemo(() => drawerView(fullBook, fullBook.unassigned, undefined), [fullBook]);
  const cancelledView = useMemo(() => drawerView(fullBook, fullBook.cancelled, month), [fullBook, month]);
  const historicView = useMemo(() => drawerView(fullBook, fullBook.historic, undefined), [fullBook]);

  // My pay: the viewer's own installed work, soonest money first. The month is
  // applied here now that the page hands over the whole book — this tab has
  // always meant the month on the picker and still does.
  const mySales = useMemo(
    () =>
      sales
        .filter((sale) =>
          sale.salesRepId === user?.uid &&
          !!sale.installDate &&
          isPayableSale(sale) &&
          (!month || isInMonth(sale.saleDate, month)))
        .sort((a, b) => new Date(b.installDate!).getTime() - new Date(a.installDate!).getTime()),
    [month, sales, user?.uid]
  );
  const myExpected = useMemo(
    () => mySales.reduce((sum, sale) => sum + (expectedPayForSale(sale, payPlan?.rates ?? null) ?? 0), 0),
    [mySales, payPlan?.rates]
  );

  // Every post-write refetch is `fresh`. The order cache is invalidated only on
  // the instance that served the write, so a cached read after a link or an
  // assign can hand back the row exactly as it was — which looks like the
  // action having no effect at all.
  const refetchFiber = useCallback(async () => {
    await fiber?.refetch?.({ fresh: true });
  }, [fiber]);

  /** Undo a dismissal: clear `saleLink` so the address guess can try again. */
  const undismiss = useCallback(async (row: MergedRow) => {
    const orderId = row.order?.id;
    if (!orderId || undoingKey) return;
    setUndoingKey(row.key);
    setUndoError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/sales/status/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orderId, clear: true }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to undo');
      await refetchFiber();
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : 'Failed to undo');
    } finally {
      setUndoingKey(null);
    }
  }, [refetchFiber, undoingKey]);

  // The rows the detail sheet arrows through: whichever list is on screen. A
  // never-logged row has no sale to open, so it is not in this list either.
  const openRep = openRepId ? book.reps.find((rep) => rep.repId === openRepId) : undefined;
  const repSales = useMemo(
    () => (openRep?.rows ?? []).map((row) => row.sale).filter((sale): sale is Sale => !!sale),
    [openRep]
  );
  const cancelledSaleRows = useMemo(
    () => book.cancelled.map((row) => row.sale).filter((sale): sale is Sale => !!sale),
    [book.cancelled]
  );
  // A tab the viewer is no longer entitled to must not keep rendering because
  // it happens to be the one in state.
  const activeTab: 'company' | 'pay' = tab === 'pay' && !hasPlan ? 'company' : tab;

  const sheetSales =
    activeTab === 'pay'
      ? mySales
      : cancelledSaleRows.some((sale) => sale.id === selectedId)
        ? cancelledSaleRows
          : repSales;
  const selectedIndex = selectedId ? sheetSales.findIndex((sale) => sale.id === selectedId) : -1;
  const selectedSale = selectedIndex >= 0 ? sheetSales[selectedIndex] : null;
  const moveSelection = (direction: number) => {
    if (!sheetSales.length) return;
    const next = (selectedIndex + direction + sheetSales.length) % sheetSales.length;
    setSelectedId(sheetSales[next]?.id || null);
  };

  const payScaleLabel = payPlan?.compRole ? RoleDisplayNames[payPlan.compRole] : null;

  // The picker reads the FULL book, never the month view. A sale logged on the
  // 30th against an order dated the 2nd of the next month is the ordinary case
  // the address guess misses, and it is unreachable from either month's list —
  // which made the one action that fixes a red row impossible to perform.
  const linkCandidates = useMemo(() => {
    if (!linkingRow) return [];
    const rep = fullBook.reps.find((entry) => entry.repId === linkingRow.repId);
    const withSales = (rep?.rows ?? []).filter((row) => !!row.sale && row.key !== linkingRow.key);
    return rankCandidates(withSales, linkingRow.order).map((row) => ({
      sale: row.sale!,
      // The list spans months now, so each row has to carry its own.
      hint: [
        row.month ? monthLabel(row.month) : 'No sale date',
        row.state === 'waiting' ? 'not in the report' : null,
      ].filter(Boolean).join(' · '),
    }));
  }, [fullBook.reps, linkingRow]);

  /** One customer. What it says depends entirely on which state it is in. */
  const renderRow = (row: MergedRow) => {
    // Settled: an admin looked at this order and said it is not one of ours. It
    // stays on the page as the record of that answer — grey, out of the count,
    // and reversible — rather than disappearing as if it had never arrived.
    if (row.state === 'dismissed') {
      const order = row.order!;
      return (
        <div className="sales-board-sale dismissed" key={row.key}>
          <span className="sales-board-sale-cust">{row.address || row.customerName || 'Address unavailable'}</span>
          <span className="sales-board-chip dismissed">Not a sale</span>
          <span className="sales-board-sale-prod">{orderLine(order)}</span>
          {/* Undo CLEARS saleLink rather than writing null to it — null IS the
              dismissal, so writing it again would change nothing. */}
          <span className="sales-board-rowact">
            <button
              type="button"
              className="sales-board-rowact-btn"
              disabled={undoingKey === row.key}
              onClick={() => void undismiss(row)}
            >
              {undoingKey === row.key ? 'Undoing' : 'Undo'}
            </button>
          </span>
        </div>
      );
    }

    // Carrier history from before anyone here used the portal. Nobody failed to
    // log these — there was nothing to log into — so they get the same quiet
    // treatment as a dismissal and none of the red.
    if (row.state === 'historic') {
      const order = row.order!;
      return (
        <div className="sales-board-sale historic" key={row.key}>
          <span className="sales-board-sale-cust">{row.address || row.customerName || 'Address unavailable'}</span>
          <span className="sales-board-chip historic">Before the portal</span>
          <span className="sales-board-sale-prod">{orderLine(order)}</span>
        </div>
      );
    }

    if (row.state === 'never_logged') {
      const order = row.order!;
      // A link that never took effect is NOT "nobody logged it" — somebody did.
      // Two different causes land here (the named sale is gone, or another
      // order already claimed it), so the wording names neither: it says the
      // link is not in effect, which is true of both, and asks for the sale
      // again. Until it is answered the stale link keeps blocking the guess.
      return (
        <div className={`sales-board-sale never-logged${row.linkBroken ? ' link-broken' : ''}`} key={row.key}>
          <span className="sales-board-sale-cust">{row.address || row.customerName || 'Address unavailable'}</span>
          <span className={`sales-board-chip ${row.linkBroken ? 'broken' : 'never'}`}>
            {row.linkBroken ? 'Link broken' : 'Not in the portal'}
          </span>
          <span className="sales-board-sale-prod">{orderLine(order)}</span>
          {row.linkBroken && (
            <span className="sales-board-sale-note warn">
              This link isn&apos;t active. Pick the sale again — nothing will re-join it until you do.
            </span>
          )}
          <span className="sales-board-rowact">
            <button type="button" className="sales-board-rowact-btn" onClick={() => setLinkingRow(row)}>
              {row.linkBroken ? 'Re-link this order' : 'Which sale is this?'}
            </button>
          </span>
        </div>
      );
    }

    const sale = row.sale!;
    const gap = row.valueGap;
    return (
      <div
        className={`sales-board-sale ${row.state === 'cancelled' ? 'cancelled' : row.bucket}`}
        key={row.key}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedId(sale.id || null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedId(sale.id || null);
          }
        }}
      >
        <span className="sales-board-sale-cust">
          {row.customerName || row.address || 'Customer pending'}
        </span>
        <span className="sales-board-sale-val">
          {formatMoney(row.value)}<small>/mo</small>
        </span>
        <span className="sales-board-sale-prod">
          {row.state === 'cancelled'
            ? `${row.repName}${sale.cancelReason ? ` · ${sale.cancelReason}` : ''}`
            : productSummary(sale) || row.order?.fiberPlan || '—'}
        </span>
        <span className={`sales-board-chip ${row.state === 'cancelled' ? 'cancelled' : row.bucket}`}>
          {row.state === 'cancelled' ? `Cancelled ${formatDate(sale.cancelledAt)}` : installChip(sale, row.bucket)}
        </span>
        {row.state === 'waiting' && (
          <span className="sales-board-sale-note">Not in the report yet</span>
        )}
        {row.state === 'agreed' && gap && (
          <span className="sales-board-sale-note gap">
            Check · carrier has {formatMoney(gap.carrierMrc)}/mo
          </span>
        )}
      </div>
    );
  };

  const drawer = (
    key: 'never' | 'unassigned' | 'cancelled' | 'historic',
    label: string,
    count: number,
    hidden: { olderCount: number; newerCount: number },
    body: ReactNode,
    // Drawer 1's head counts only the LIVE problems, but its body also holds
    // the settled ones, so what is on screen and what the head says differ.
    inView: number = count,
    /** Says what the drawer IS, where the title alone could be misread as blame. */
    note?: string
  ) => {
    if (inView === 0 && !hidden.olderCount && !hidden.newerCount) return null;
    const open = openDrawer === key;
    const more = outOfViewLabel(hidden);
    return (
      <div className="sales-board-drawer" key={key}>
        <button
          className={`sales-board-drawer-head${open ? ' open' : ''}${key === 'unassigned' ? ' alert' : ''}`}
          type="button"
          aria-expanded={open}
          onClick={() => setOpenDrawer(open ? null : key)}
        >
          <span className="sales-board-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="sales-board-drawer-label">
            {label}
            {note && <em className="sales-board-drawer-more">{note}</em>}
            {more && <em className="sales-board-drawer-more">{more} outside this month</em>}
          </span>
          <span className="sales-board-drawer-count">{count}</span>
        </button>
        {open && body}
      </div>
    );
  };

  return (
    <>
      {(hasPlan || ownerView) && (
        <nav className="sales-line-tabs" aria-label="Sales views">
          <button
            className="sales-line-tab"
            role="tab"
            type="button"
            aria-selected={activeTab === 'company'}
            onClick={() => { setTab('company'); setSelectedId(null); }}
          >
            Company
          </button>
          {hasPlan && (
            <button
              className="sales-line-tab"
              role="tab"
              type="button"
              aria-selected={activeTab === 'pay'}
              onClick={() => { setTab('pay'); setSelectedId(null); }}
            >
              My pay
            </button>
          )}
        </nav>
      )}

      {activeTab === 'company' ? (
        <section className="sales-board" aria-label="Company sales by rep">
          {truncated && (
            <p className="sales-board-warning" role="alert">
              This book was cut short at the fetch limit. Sales are missing from every month,
              the figures below are incomplete, and some rows may show as not in the portal
              when the rep did log them.
            </p>
          )}
          {undoError && <p className="sales-board-warning" role="alert">{undoError}</p>}

          <div className="sales-board-summary">
            <div className="sales-board-figs">
              <div className="sales-board-fig">
                <strong className="portal-metallic-num">{countedCount}</strong>
                <span>Sales</span>
              </div>
              <div className="sales-board-fig">
                <strong className="portal-metallic-num">{formatMoney(monthValue)}<small> / mo</small></strong>
                <span>Value</span>
              </div>
              {/* Carrier installs with no sale in the portal. It is NOT a count
                  of people owed money: the company is only just starting to log
                  sales here, and most of the older ones were almost certainly
                  paid outside the portal and simply never entered. So it states
                  a fact and carries no alarm — the emphasis lives on the one
                  group inside drawer 1 that is actually surprising. */}
              <div className="sales-board-fig">
                <strong className="portal-metallic-num">{book.notLoggedCount}</strong>
                <span>Not in the portal</span>
              </div>
            </div>

            {/* Weighted by count, so the bar IS the pipeline rather than a legend. */}
            <div className="sales-board-strip" role="img" aria-label={countsSummary(counts) || 'No sales this month'}>
              {counts.installed > 0 && <i className="installed" style={{ flexGrow: counts.installed }} />}
              {counts.scheduled > 0 && <i className="scheduled" style={{ flexGrow: counts.scheduled }} />}
              {counts.attention > 0 && <i className="attention" style={{ flexGrow: counts.attention }} />}
              {countedCount === 0 && <i className="empty" style={{ flexGrow: 1 }} />}
            </div>

            <p className="sales-board-key">
              <span className="installed">{counts.installed} installed</span>
              <span className="scheduled">{counts.scheduled} scheduled</span>
              <span className="attention">{counts.attention} need a date</span>
            </p>

            {/* Nothing is hidden without saying so. */}
            {(olderCount > 0 || newerCount > 0) && (
              <p className="sales-board-scope">
                {outOfViewLabel({ olderCount, newerCount })} outside this month
              </p>
            )}
          </div>

          <div className="sales-board-reps-head">
            <span>Rep</span>
            <span>Value / mo</span>
          </div>

          {book.reps.length === 0 && !loading && (
            <p className="sales-line-ledger-empty">No sales logged this month.</p>
          )}

          {book.reps.map((rep) => {
            const open = openRepId === rep.repId;
            return (
              <div key={rep.repId}>
                <button
                  className={`sales-board-rep${open ? ' open' : ''}`}
                  type="button"
                  aria-expanded={open}
                  onClick={() => { setOpenRepId(open ? null : rep.repId); setSelectedId(null); }}
                >
                  <span className="sales-board-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <span className="sales-board-rep-name">{rep.repName}</span>
                  <span className="sales-board-rep-value">{formatMoney(rep.value)}</span>
                  {/* "5 installed · 2 scheduled · 1 not in the portal" — only the last
                      part is red, because only the last part is a problem. */}
                  <span className="sales-board-rep-sub">
                    {countsSummary(rep.counts)}
                    {rep.notLogged > 0 && (
                      <em className="sales-board-rep-flag">
                        {countsSummary(rep.counts) ? ' · ' : ''}{rep.notLogged} not in the portal
                      </em>
                    )}
                  </span>
                  <span className="sales-board-rep-count">{rep.count} sale{rep.count === 1 ? '' : 's'}</span>
                </button>

                {open && <div className="sales-board-sales">{rep.rows.map(renderRow)}</div>}
              </div>
            );
          })}

          {drawer(
            'never',
            'Carrier installed it — not logged here',
            sinceView.rows.length + earlierView.rows.length,
            neverView,
            <div className="sales-board-sales">
              {/* First, and the only group here carrying any emphasis: a rep was
                  demonstrably using the site in these months and the install is
                  still not in the book. */}
              {(sinceView.rows.length > 0 || sinceView.olderCount > 0 || sinceView.newerCount > 0) && (
                <>
                  <p className="sales-board-drawer-sub attention">
                    Since reps started logging · {sinceView.rows.length}
                    {outOfViewLabel(sinceView) && <em> · {outOfViewLabel(sinceView)}</em>}
                  </p>
                  {sinceView.rows.map(renderRow)}
                </>
              )}
              {/* Second and quieter: before July nobody was logging here at all,
                  so these say nothing about anybody. */}
              {(earlierView.rows.length > 0 || earlierView.olderCount > 0 || earlierView.newerCount > 0) && (
                <>
                  <p className="sales-board-drawer-sub">
                    Before that · {earlierView.rows.length}
                    {outOfViewLabel(earlierView) && <em> · {outOfViewLabel(earlierView)}</em>}
                  </p>
                  <div className="sales-board-group-quiet">
                    {earlierView.rows.map(renderRow)}
                  </div>
                </>
              )}
              {dismissedView.rows.length > 0 && (
                <>
                  <p className="sales-board-drawer-sub">
                    Marked not a sale · {dismissedView.rows.length}
                  </p>
                  <div className="sales-board-group-quiet">
                    {dismissedView.rows.map(renderRow)}
                  </div>
                </>
              )}
            </div>,
            sinceView.rows.length + earlierView.rows.length + dismissedView.rows.length,
            'May already have been paid outside the portal. Log them to bring them in.'
          )}

          {drawer(
            'unassigned',
            'Orders with no rep matched',
            unassignedView.rows.length,
            unassignedView,
            <UnassignedOrders rows={unassignedView.rows} onAssigned={refetchFiber} />
          )}

          {drawer(
            'cancelled',
            'Cancelled this month',
            cancelledView.rows.length,
            cancelledView,
            <div className="sales-board-sales">{cancelledView.rows.map(renderRow)}</div>
          )}

          {/* Last, quiet, and its own drawer rather than a section inside the
              never-logged one: that drawer is a list of things somebody has to
              answer for, and these are the opposite of that. */}
          {drawer(
            'historic',
            'From before the portal',
            historicView.rows.length,
            historicView,
            <div className="sales-board-sales">{historicView.rows.map(renderRow)}</div>,
            historicView.rows.length,
            'Carrier orders from before the portal existed. There is nothing to do with these.'
          )}
        </section>
      ) : (
        <section className="sales-board" aria-label="My expected pay">
          <div className="sales-board-summary">
            {payScaleLabel && <span className="sales-board-scale">Pay scale · {payScaleLabel}</span>}
            <div className="sales-board-figs">
              <div className="sales-board-fig">
                <strong className="portal-metallic-num">{formatMoney(myExpected)}</strong>
                <span>Estimated this month</span>
              </div>
            </div>
            <p className="sales-board-note">
              An estimate off your installs — not a statement of pay. Chargebacks,
              claims and cancellations are not in the portal, and the carrier&rsquo;s
              final report decides what actually pays.
            </p>
          </div>

          {mySales.length === 0 ? (
            <p className="sales-line-ledger-empty">
              Nothing installed yet. Pay shows up here once one of your sales has an install date.
            </p>
          ) : (
            mySales.map((sale) => {
              const expected = expectedPayForSale(sale, payPlan?.rates ?? null);
              return (
                <div
                  className="sales-board-payrow"
                  key={sale.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(sale.id || null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(sale.id || null);
                    }
                  }}
                >
                  <span className="sales-board-sale-cust">
                    {sale.customerName || sale.customerAddress || 'Customer pending'}
                  </span>
                  {/* A rate of 0 means the comp plan has no contracted rate for
                      that product yet — say so rather than promising $0. */}
                  <span className={`sales-board-amt${expected ? '' : ' pending'}`}>
                    {expected ? formatMoney(expected) : 'Rate pending'}
                  </span>
                  <span className="sales-board-sale-prod">
                    {productSummary(sale) || '—'} · installed {formatDate(sale.installDate)}
                  </span>
                  <span className="sales-board-when">Sold {formatDate(sale.saleDate)}</span>
                  {/* Stops the row's own click so ticking Paid doesn't also
                      open the detail sheet over the top of it. */}
                  <span
                    className="sales-board-paid sales-line-paid-cell"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <label className="sales-line-paid-toggle">
                      <input
                        type="checkbox"
                        checked={!!paidBySale[sale.id || '']}
                        onChange={() => void togglePaid(sale.id || '')}
                        aria-label={`Mark pay received for ${sale.customerName || sale.customerAddress || 'this sale'}`}
                      />
                      <span className="sales-line-paid-label">Paid</span>
                    </label>
                  </span>
                </div>
              );
            })
          )}
        </section>
      )}

      <SaleDetailSheet
        sale={selectedSale}
        index={selectedIndex}
        total={sheetSales.length}
        open={!!selectedSale}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        onPrev={() => moveSelection(-1)}
        onNext={() => moveSelection(1)}
        isAdmin={isAdmin}
        loading={loading}
        onRequestDelete={(id) => setDeletingId(id)}
        onRequestCancel={onSetCancelled ? (id) => { setCancelReason(''); setCancellingId(id); } : undefined}
        onRestore={onSetCancelled ? (id) => { void onSetCancelled(id, false); } : undefined}
      />

      <LinkOrderDialog
        row={linkingRow}
        candidates={linkCandidates}
        onClose={() => setLinkingRow(null)}
        onLinked={refetchFiber}
      />

      <Dialog
        open={!!cancellingId}
        onOpenChange={(open) => { if (!open) setCancellingId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel sale</DialogTitle>
            <DialogDescription>
              The customer backed out. The sale stays on the books as a record but drops out of
              this month&apos;s totals, the install pipeline and everyone&apos;s pay. You can undo it later.
            </DialogDescription>
          </DialogHeader>
          <label className="sales-board-reason">
            <span>Reason (optional)</span>
            <input
              type="text"
              value={cancelReason}
              maxLength={300}
              placeholder="Customer changed their mind"
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancellingId(null)}>Keep sale</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={() => {
                const id = cancellingId;
                const reason = cancelReason.trim();
                setCancellingId(null);
                setSelectedId(null);
                if (id) void onSetCancelled?.(id, true, reason);
              }}
            >
              Cancel sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sale</DialogTitle>
            <DialogDescription>Are you sure you want to delete this sale? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={() => {
                const id = deletingId;
                setDeletingId(null);
                setSelectedId(null);
                if (id) void onDelete?.(id);
              }}
            >
              Delete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
