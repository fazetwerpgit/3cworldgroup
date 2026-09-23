'use client';

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { Check, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { Sale, SaleStatusConfig } from '@/types';
import type { FiberStatusResponse } from '@/types';
import type { CompPlanCompanyRates } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useSalePaid } from '@/hooks/useSalePaid';
import { expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import { formatPayoutWindow, payoutWindowForSale } from '@/lib/pay/payoutWindow';
import { groupPaySales, type PayGroup } from '@/lib/pay/payGroups';
import { planLabel, rowStatus, type RowStatus } from '@/lib/dashboard/repSummary';
import { carrierMark, planWithoutCarrier } from '@/lib/sales/carrierMark';
import { countedSales, isCarrierCancelled } from '@/lib/sales/installBucket';
import { isCurrentMonth, monthLabel, salesSoldIn, type MonthKey } from '@/lib/sales/monthWindow';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';
import { SaleDetailSheet } from './SaleDetailSheet';
import { SalesDialog } from './SalesDialog';
import { InstallStatusLine } from './InstallStatusLine';
import { FiberRows, fiberTone, sortFiberOrders, type FiberBucket } from './InstallStatusSection';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';

// A rep's own ledger. Management no longer renders this at all — they get
// AdminSalesBoard, which groups the whole company by rep. Splitting the two
// removed the `canApprove` forks that used to run through every branch here.
interface SalesTableProps {
  sales: Sale[];
  onDelete?: (saleId: string) => void | Promise<boolean>;
  loading?: boolean;
  /** The [All | Pay] selection, held by the page. */
  payView?: boolean;
  onPayViewChange?: (payView: boolean) => void;
  /** The month the page's picker is on. Omitted, the whole book is listed. */
  month?: MonthKey;
  /**
   * The viewer's own comp-plan slice. A planless rep sees no dollar figures;
   * `error` means the rates failed to load (not "no plan"), with `onRetry`.
   */
  payPlan?: {
    rates: CompPlanCompanyRates | null;
    payDelayDays: number;
    hasPlan: boolean;
    error?: boolean;
    onRetry?: () => void;
  };
  /** Provider install status, fetched once by the page. */
  fiber?: { data: FiberStatusResponse | null; loading: boolean; error: string | null };
  /** Refetches the book after the detail sheet edits a sale's install date. */
  onSaleUpdated?: () => void;
  /** A sale just logged on this phone (Log Sale's `?logged=`): its row slides in once. */
  arriveId?: string | null;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The first product's carrier wordmark, or null when the sale has no products. */
function saleCarrier(sale: Pick<Sale, 'products'>): string | null {
  return carrierMark(sale.products?.[0]?.company) || null;
}

/** The plan beside its carrier mark, without the carrier said twice. */
function salePlan(sale: Pick<Sale, 'products' | 'productSold'>, mark: string | null): string {
  const label = planLabel(sale);
  return mark ? planWithoutCarrier(label, sale.products?.[0]?.company) : label;
}

const STAMP_MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' });

/** "SEP / 22": the Bebas date stamp that leads a row. */
function DateStamp({ value, label }: { value: Date | string | null | undefined; label: string }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return (
      <span className={x.stamp}>
        <span className={s.srOnly}>{label}: not set</span>
        <b aria-hidden="true">—</b>
      </span>
    );
  }
  return (
    <span className={x.stamp}>
      <span className={s.srOnly}>{label} </span>
      {STAMP_MONTH.format(date)}
      <b>{date.getDate()}</b>
    </span>
  );
}

/** Every dollar here is an estimate, and says so. */
function EstPay({ value, hasPlan }: { value: number | null | undefined; hasPlan: boolean }) {
  if (!hasPlan || value === null || value === undefined) return <span className={`${x.amt} ${x.muted}`}>—</span>;
  if (value === 0) return <span className={`${x.amt} ${x.amtQuiet}`}>Rate pending</span>;
  return (
    <span className={x.amt}>
      <small className={x.amtEst}>est.</small>
      {formatMoney(value)}
    </span>
  );
}

const GROUP_NOTE: Record<PayGroup['kind'], string> = {
  window: 'T-Fiber payout window',
  other: 'No published payout window',
  missed: 'Gets a window once it is rescheduled',
  undated: 'Gets a window once it has a date',
};

/** "Sep 21–25 · est. $280" — a pay period, always a range, always an estimate. */
function PayGroupHead({ group, hasPlan }: { group: PayGroup; hasPlan: boolean }) {
  const installs = group.window
    ? `installs ${formatDate(group.window.installFrom)}–${group.window.installTo.getDate()}`
    : null;
  return (
    <div className={x.pgHead}>
      <p className={x.payGroupText}>
        <strong id={`pay-${group.key}`} className={x.pgTitle}>
          {group.label}
          {hasPlan && group.amount !== null ? (
            <span className={x.pgAmt}> · est. {formatMoney(group.amount)}</span>
          ) : null}
        </strong>
        <span className={x.pgMeta}>
          {[GROUP_NOTE[group.kind], installs, `${group.sales.length} ${group.sales.length === 1 ? 'sale' : 'sales'}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </p>
    </div>
  );
}

export function SalesTable({
  sales,
  onDelete,
  loading = false,
  payView = false,
  onPayViewChange,
  month,
  payPlan,
  fiber,
  onSaleUpdated,
  arriveId = null,
}: SalesTableProps) {
  const { user, isRole } = useAuth();
  const isAdmin = isRole('admin');
  const showPay = payView;
  const rates = payPlan?.rates ?? null;
  const hasPlan = !!payPlan?.hasPlan;
  const { paidBySale, togglePaid } = useSalePaid(user?.uid ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fiberView, setFiberView] = useState<FiberBucket | null>(null);

  // A rep's ledger is always their whole book — there is nothing to filter by.
  // Pay is owed off the install, so a sale without an install date has nothing
  // to show yet, and a dead sale never will. Newest install first — that is the
  // money arriving soonest.
  // The two tabs slice the month by DIFFERENT dates on purpose. The ledger
  // lists what was sold; the pay list lists what installed, because pay is owed
  // off the install — a sale sold in August that installs in September is
  // August's record and September's money, and it has to appear in both.
  const fiberOrders = useMemo(() => fiber?.data?.orders ?? [], [fiber?.data?.orders]);
  const fiberBySale = useMemo(
    () => matchFiberOrdersToSales(sales, fiberOrders),
    [fiberOrders, sales]
  );
  const monthSales = useMemo(
    () => (month ? salesSoldIn(sales, month) : sales),
    [month, sales]
  );
  // The pay list is grouped by pay period (owner, 2026-09-22): one group per
  // T-Fiber payout window, scheduled installs included, then other carriers by
  // install month, then sales with no install date yet. Windows come live from
  // each sale's current install date, so a reschedule moves the sale by itself.
  // "No install date" is live state, not a month's history, so it only shows on
  // the current month.
  const payGroups = useMemo(
    () => groupPaySales(sales, fiberBySale, hasPlan ? rates : null, {
      month,
      includeUndated: !month || isCurrentMonth(month),
    }),
    [fiberBySale, hasPlan, month, rates, sales]
  );
  const paySales = useMemo(() => payGroups.flatMap((group) => group.sales), [payGroups]);
  // Money with a date that stands: missed and undated sales wait on a new date.
  const datedPayGroups = payGroups.filter((group) => group.kind === 'window' || group.kind === 'other');
  const datedPayCount = datedPayGroups.reduce((sum, group) => sum + group.sales.length, 0);
  const datedPayTotal = hasPlan
    ? datedPayGroups.reduce((sum, group) => sum + (group.amount ?? 0), 0)
    : null;
  const expectedBySale = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const sale of sales) {
      const cancelled = !isPayableSale(sale) || isCarrierCancelled(fiberBySale.get(sale.id || ''));
      map[sale.id || ''] = cancelled ? null : expectedPayForSale(sale, rates);
    }
    return map;
  }, [fiberBySale, rates, sales]);
  // The dashboard's status and payout window per sale, from one frozen "now".
  const now = useMemo(() => new Date(), []);
  const statusBySale = useMemo(() => {
    const map: Record<string, RowStatus> = {};
    for (const sale of sales) map[sale.id || ''] = rowStatus(sale, fiberBySale.get(sale.id || ''), now);
    return map;
  }, [fiberBySale, now, sales]);
  const payoutBySale = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const sale of sales) {
      // Scheduled and completed installs alike. A cancellation has none, and a
      // missed install gets one again once it is rescheduled.
      const status = statusBySale[sale.id || ''];
      const window = payoutWindowForSale(sale, status !== 'cancelled' && status !== 'missed');
      map[sale.id || ''] = window ? formatPayoutWindow(window) : null;
    }
    return map;
  }, [sales, statusBySale]);

  // The rows actually on screen — the ledger, or the pay list.
  const listSales = showPay ? paySales : monthSales;
  const selectedIndex = selectedId ? listSales.findIndex((sale) => sale.id === selectedId) : -1;
  const selectedSale = selectedIndex >= 0 ? listSales[selectedIndex] : null;

  // The just-logged row plays its arrival on the first render that has it, and
  // only then: the mark clears once it has played, or after 10s if it never
  // shows, so a refresh or a month switch back never replays it.
  const [arriving, setArriving] = useState(arriveId);
  const arrivingShown = !!arriving && listSales.some((sale) => sale.id === arriving);
  useEffect(() => {
    if (!arriving) return;
    const timer = setTimeout(() => setArriving(null), arrivingShown ? 1000 : 10_000);
    return () => clearTimeout(timer);
  }, [arriving, arrivingShown]);
  const arriveClass = (sale: Sale) => (arriving && sale.id === arriving ? x.arrive : '');
  // The total under the list is MONEY, so a cancellation leaves it — whoever
  // cancelled it, us or the carrier. The row itself stays on screen, marked.
  const totalValue = countedSales(listSales, fiberBySale).reduce((sum, sale) => sum + (sale.totalValue || 0), 0);
  const expectedTotal = hasPlan
    ? listSales.reduce((sum, sale) => sum + (expectedBySale[sale.id || ''] ?? 0), 0)
    : null;
  const fiberBucketCounts = useMemo(() => {
    const counts: Record<FiberBucket, number> = { pending: 0, active: 0, cancelled: 0, attention: 0 };
    fiberOrders.forEach((order) => {
      if (order.status === 'pending_install' || order.status === 'pre_sale') counts.pending += 1;
      else if (order.status === 'active') counts.active += 1;
      else if (order.status === 'cancelled' || order.status === 'churned') counts.cancelled += 1;
      else counts.attention += 1;
    });
    return counts;
  }, [fiberOrders]);
  const fiberBucketOrders = useMemo(() => {
    if (!fiberView) return [];
    return sortFiberOrders(fiberOrders.filter((order) => {
      if (fiberView === 'pending') return order.status === 'pending_install' || order.status === 'pre_sale';
      if (fiberView === 'active') return order.status === 'active';
      if (fiberView === 'cancelled') return order.status === 'cancelled' || order.status === 'churned';
      return order.status === 'breakage';
    }));
  }, [fiberOrders, fiberView]);
  const showFiberView = fiberView !== null;

  const moveSelection = useCallback((direction: number) => {
    if (!listSales.length) return;
    const current = listSales.findIndex((sale) => sale.id === selectedId);
    const next = (current + direction + listSales.length) % listSales.length;
    setSelectedId(listSales[next]?.id || null);
  }, [listSales, selectedId]);

  useEffect(() => {
    if (!selectedSale) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1);
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveSelection, selectedSale]);

  const handleDelete = async () => {
    if (!deletingId || !onDelete) return;
    const id = deletingId;
    setDeletingId(null);
    await onDelete(id);
  };

  const rowActions = (sale: Sale) => {
    if (!isAdmin) return null;
    return (
      <span className={x.rowActions} onClick={(event) => event.stopPropagation()}>
        <Link className={x.quietBtn} href={`/portal/sales/${sale.id}/edit`} aria-label={`Edit ${sale.customerName || 'sale'}`}>
          <Pencil size={16} aria-hidden="true" />
        </Link>
        <button className={x.quietBtn} type="button" disabled={loading} aria-label={`Delete ${sale.customerName || 'sale'}`} onClick={() => setDeletingId(sale.id || null)}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </span>
    );
  };

  const openRow = (sale: Sale) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => setSelectedId(sale.id || null),
    onKeyDown: (event: ReactKeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setSelectedId(sale.id || null);
      }
    },
  });

  const statusCell = (sale: Sale) => {
    const order = fiberBySale.get(sale.id || '');
    const status = statusBySale[sale.id || ''] ?? 'needs-date';
    return (
      <span className={x.statusStack}>
        <InstallStatusLine sale={sale} order={order} status={status} />
        {(sale.status === 'pending' || sale.status === 'rejected') && (
          <span className={`${x.tag} ${sale.status === 'rejected' ? x.tagWarn : ''}`}>{SaleStatusConfig[sale.status].name}</span>
        )}
      </span>
    );
  };

  const selectView = (view: FiberBucket | null, pay: boolean) => {
    setSelectedId(null);
    setFiberView(view);
    onPayViewChange?.(pay);
  };

  return (
    <>
      <section className={`${s.panel} ${x.ledger}`} aria-labelledby="ledger-h">
        <div className={x.boardHead}>
          {/* NOT "What you get paid". The owner's words, via Jacob
              (2026-09-03): "if claims and final chargebacks are not accounted
              for I will have to pay that out", and "if final reports don't
              show that on the site I can be sued". The portal does not hold
              chargebacks or claims, so it must never state a rep's pay — only
              estimate it, and say so where the figure is. */}
          <h2 id="ledger-h" className={x.boardTitle}>{showPay ? 'Est. pay' : 'Your sales'}</h2>
          <p className={x.boardMeta}>{showPay
            ? `${datedPayCount} ${datedPayCount === 1 ? 'sale' : 'sales'}`
            : `${listSales.length} record${listSales.length === 1 ? '' : 's'} · tap a row for detail`}</p>
        </div>

        <div className={x.segWell} role="tablist" aria-label="Sales views">
          <button className={x.segTab} role="tab" type="button" aria-selected={!showPay} onClick={() => selectView(null, false)}>Sales</button>
          <button className={x.segTab} role="tab" type="button" aria-selected={showPay} onClick={() => selectView(null, true)}>Pay</button>
        </div>

        {fiberOrders.length > 0 && !showPay && (
          <div className={x.chips} role="group" aria-label="Fiber status views">
            <button
              type="button"
              className={x.chip}
              aria-pressed={fiberView === null}
              onClick={() => selectView(null, false)}
            >
              Sent in <b>{monthSales.length}</b>
            </button>
            {([
              ['pending', 'Pending install'],
              ['active', 'Active'],
              ['cancelled', 'Cancelled'],
              ['attention', 'Needs attention'],
            ] as Array<[FiberBucket, string]>).map(([key, label]) => {
              if (fiberBucketCounts[key] === 0) return null;
              return (
                <button
                  key={key}
                  type="button"
                  className={x.chip}
                  aria-pressed={fiberView === key}
                  onClick={() => selectView(key, false)}
                >
                  <span className={`${x.dot} ${fiberTone(key)}`} aria-hidden="true" />
                  {label} <b>{fiberBucketCounts[key]}</b>
                </button>
              );
            })}
          </div>
        )}

        {showFiberView ? (
          <div className={x.fiberView}>
            <p className={x.srcNote}>
              From the provider report · updated {formatDate(fiber?.data?.lastReportAt)}
            </p>
            <FiberRows orders={fiberBucketOrders} />
          </div>
        ) : showPay ? (
          <div>
            {payPlan?.error ? (
              <div className={`${s.failed} ${x.planFailed}`} role="alert">
                <span>Couldn&apos;t load pay rates</span>
                {payPlan.onRetry ? (
                  <button type="button" className={s.retry} onClick={payPlan.onRetry}>
                    <RotateCw size={14} aria-hidden="true" />
                    Retry
                  </button>
                ) : null}
              </div>
            ) : !hasPlan ? (
              <p className={`${x.note} ${x.noteWarn}`}>No pay plan assigned yet. Ask an admin to set your role.</p>
            ) : null}
            {/* Stated once, above the money, rather than as a footnote under it. */}
            <p className={x.payNote}>
              Estimates before chargebacks and claims; the carrier&rsquo;s final report decides what pays. Tick a sale off yourself once the money lands.
            </p>
            <div className={`${x.lhead} ${x.pRow} ${hasPlan ? '' : x.noMoney}`} aria-hidden="true">
              <span className={x.lhStamp}>Install</span>
              <span>Customer</span>
              <span>Status</span>
              {hasPlan && <span className={x.num}>Est. pay</span>}
              <span className={x.lhPaid}>Paid</span>
            </div>
            {payGroups.length ? (
              payGroups.map((group) => (
                <div key={group.key} role="group" aria-labelledby={`pay-${group.key}`}>
                  <PayGroupHead group={group} hasPlan={hasPlan} />
                  {group.sales.map((sale) => {
                    const expected = expectedBySale[sale.id || ''] ?? null;
                    const paid = !!paidBySale[sale.id || ''];
                    const status = statusBySale[sale.id || ''];
                    const mark = saleCarrier(sale);
                    const name = sale.customerName || sale.customerAddress || 'Customer pending';
                    // Money only lands on an install, so the tick shows there;
                    // a tick already set stays reachable so it can be undone.
                    const canTick = status === 'installed' || paid;
                    return (
                      <div
                        className={`${x.pRow} ${hasPlan ? '' : x.noMoney} ${status === 'cancelled' ? x.saleOff : ''} ${arriveClass(sale)}`}
                        data-part="pay-row"
                        key={sale.id}
                        {...openRow(sale)}
                      >
                        <DateStamp value={sale.installDate} label="Install" />
                        <span className={x.sName}>
                          <strong>{name}</strong>
                        </span>
                        {hasPlan && (
                          <span className={x.sPay}>
                            <EstPay value={expected} hasPlan={hasPlan} />
                          </span>
                        )}
                        <span className={x.sStatus}>{statusCell(sale)}</span>
                        <span className={x.sMeta}>
                          {mark ? <span className={x.carrierMark}>{mark}</span> : null}
                          <span className={x.sMetaText}>
                            {[salePlan(sale, mark), `Sold ${formatDate(sale.saleDate)}`].join(' · ')}
                          </span>
                        </span>
                        <span
                          className={x.sPaid}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {canTick ? (
                            <label className={x.tick}>
                              <span>Paid</span>
                              <input
                                type="checkbox"
                                checked={paid}
                                onChange={() => void togglePaid(sale.id || '')}
                                aria-label={`Mark pay received for ${name === 'Customer pending' ? 'this sale' : name}`}
                              />
                              <span className={x.tickBox} aria-hidden="true">
                                <Check size={16} strokeWidth={3} />
                              </span>
                            </label>
                          ) : (
                            <span className={x.noTick} aria-hidden="true">—</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className={x.empty}>
                {month ? `No install dates in ${monthLabel(month)}.` : 'No install dates yet.'}
                {' '}Pay shows up here once a sale has an install date.
                {month && <> Earlier months are behind the previous-month arrow above.</>}
              </p>
            )}
            <div className={x.ledgerTotals}>
              <span><b>{datedPayCount}</b> by install date{month ? ` in ${monthLabel(month)}` : ''}</span>
              {hasPlan && (
                <span className={x.totalsPay}>
                  Total <EstPay value={datedPayTotal} hasPlan={hasPlan} />
                </span>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className={`${x.lhead} ${x.sale} ${isAdmin ? x.hasAct : ''}`} aria-hidden="true">
              <span className={x.lhStamp}>Sold</span>
              <span>Customer</span>
              <span>Status</span>
              <span className={x.num}>Value</span>
              <span className={x.num}>Est. pay</span>
              {isAdmin && <span />}
            </div>
            {listSales.length ? (
              <div>
                {listSales.map((sale) => {
                  const off = statusBySale[sale.id || ''] === 'cancelled';
                  const mark = saleCarrier(sale);
                  return (
                    <div
                      className={`${x.sale} ${isAdmin ? x.hasAct : ''} ${off ? x.saleOff : ''} ${arriveClass(sale)}`}
                      data-part="sale-row"
                      key={sale.id}
                      {...openRow(sale)}
                    >
                      <DateStamp value={sale.saleDate} label="Sold" />
                      <span className={x.sName}>
                        <strong>{sale.customerName || sale.customerAddress || 'Customer pending'}</strong>
                      </span>
                      <span className={x.sPay}>
                        <EstPay value={expectedBySale[sale.id || '']} hasPlan={hasPlan} />
                      </span>
                      <span className={x.sStatus}>{statusCell(sale)}</span>
                      <span className={x.sMeta}>
                        {mark ? <span className={x.carrierMark}>{mark}</span> : null}
                        <span className={x.sMetaText}>
                          {[salePlan(sale, mark), sale.customerAddress].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className={x.sValue}>{formatMoney(sale.totalValue || 0)}/mo</span>
                      <span className={x.cActions}>{rowActions(sale)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={x.empty}>
                {month ? `No sales sold in ${monthLabel(month)}.` : 'No sales yet.'}
                {month && <> Your earlier sales are still here — use the previous-month arrow above.</>}
              </p>
            )}
            <div className={x.ledgerTotals}>
              <span>
                <b>{listSales.length}</b> {listSales.length === 1 ? 'sale' : 'sales'} · <b>{formatMoney(totalValue)}</b>/mo value
              </span>
              {hasPlan && (
                <span className={x.totalsPay}>
                  Total <EstPay value={expectedTotal} hasPlan={hasPlan} />
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <SaleDetailSheet
        sale={selectedSale}
        total={listSales.length}
        index={selectedIndex}
        open={!!selectedSale}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        onPrev={() => moveSelection(-1)}
        onNext={() => moveSelection(1)}
        isAdmin={isAdmin}
        loading={loading}
        onRequestDelete={(id) => setDeletingId(id)}
        onSaleUpdated={onSaleUpdated}
        payout={selectedSale ? payoutBySale[selectedSale.id || ''] ?? null : null}
        fiberOrder={selectedSale ? fiberBySale.get(selectedSale.id || '') ?? null : null}
        estPay={selectedSale && hasPlan ? expectedBySale[selectedSale.id || ''] ?? null : null}
      />

      <SalesDialog
        open={!!deletingId}
        title="Delete sale"
        description="Delete this sale? It can't be undone."
        onClose={() => setDeletingId(null)}
        footer={(
          <>
            <button type="button" className={x.actBtn} onClick={() => setDeletingId(null)}>Cancel</button>
            <button type="button" className={`${x.actBtn} ${x.actDanger}`} disabled={loading} onClick={() => void handleDelete()}>Delete sale</button>
          </>
        )}
      />
    </>
  );
}
