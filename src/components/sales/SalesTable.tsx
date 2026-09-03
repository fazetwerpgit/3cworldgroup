'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { Sale, SaleStatus, FIBER_COMPANIES } from '@/types';
import type { FiberStatusResponse } from '@/types';
import type { CompPlanCompanyRates } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useSalePaid } from '@/hooks/useSalePaid';
import { expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import { monthLabel, salesInstalledIn, salesSoldIn, type MonthKey } from '@/lib/sales/monthWindow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SaleDetailSheet } from './SaleDetailSheet';
import { FiberRows, FiberStatusPill, sortFiberOrders, type FiberBucket } from './InstallStatusSection';
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
  /** The viewer's own comp-plan slice. A planless rep sees no dollar figures. */
  payPlan?: { rates: CompPlanCompanyRates | null; payDelayDays: number; hasPlan: boolean };
  /** Provider install status, fetched once by the page. */
  fiber?: { data: FiberStatusResponse | null; loading: boolean; error: string | null };
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function repInitials(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function productSummary(sale: Sale) {
  return (sale.products || [])
    .map((product) => {
      const provider = FIBER_COMPANIES.find((item) => item.value === product.company)?.label || product.company;
      return `${product.productName} / ${provider}`;
    })
    .join(' · ');
}

function expectedLabel(value: number | null | undefined) {
  return typeof value === 'number' ? formatMoney(value) : '—';
}

function StatusBadge({ status }: { status: SaleStatus }) {
  return <span className={`sales-line-badge ${status}`}>{status}</span>;
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
  const monthSales = useMemo(
    () => (month ? salesSoldIn(sales, month) : sales),
    [month, sales]
  );
  const paySales = useMemo(
    () => (month ? salesInstalledIn(sales, month) : sales)
      .filter((sale) => !!sale.installDate && isPayableSale(sale))
      .sort((a, b) => new Date(b.installDate!).getTime() - new Date(a.installDate!).getTime()),
    [month, sales]
  );
  const expectedBySale = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const sale of sales) {
      map[sale.id || ''] = isPayableSale(sale) ? expectedPayForSale(sale, rates) : null;
    }
    return map;
  }, [rates, sales]);

  // The rows actually on screen — the ledger, or the pay list.
  const listSales = showPay ? paySales : monthSales;
  const selectedIndex = selectedId ? listSales.findIndex((sale) => sale.id === selectedId) : -1;
  const selectedSale = selectedIndex >= 0 ? listSales[selectedIndex] : null;
  const totalValue = listSales.reduce((sum, sale) => sum + (sale.totalValue || 0), 0);
  const expectedTotal = hasPlan
    ? listSales.reduce((sum, sale) => sum + (expectedBySale[sale.id || ''] ?? 0), 0)
    : null;
  const expectedTotalLabel = expectedLabel(expectedTotal);
  const fiberOrders = useMemo(() => fiber?.data?.orders ?? [], [fiber?.data?.orders]);
  const fiberBySale = useMemo(
    () => matchFiberOrdersToSales(sales, fiberOrders),
    [fiberOrders, sales]
  );
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
      <span className="sales-line-row-actions sales-line-quiet-actions" onClick={(event) => event.stopPropagation()}>
        <Link className="quiet" href={`/portal/sales/${sale.id}/edit`} aria-label={`Edit ${sale.customerName || 'sale'}`}>
          <Pencil className="sales-line-action-icon" />Edit
        </Link>
        <button className="quiet" type="button" disabled={loading} onClick={() => setDeletingId(sale.id || null)}>
          <Trash2 className="sales-line-action-icon" />Delete
        </button>
      </span>
    );
  };

  return (
    <>
      <section className="sales-line-ledger">
        <div className="sales-line-ledger-head">
          <div>
            <p className="sales-line-eyebrow">{showPay ? 'Your pay' : 'Your sales'}</p>
            {/* NOT "What you get paid". The owner's words, via Jacob
                (2026-09-03): "if claims and final chargebacks are not accounted
                for I will have to pay that out", and "if final reports don't
                show that on the site I can be sued". The portal does not hold
                chargebacks or claims, so it must never state a rep's pay — only
                estimate it, and say so where the figure is. */}
            <h2>{showPay ? 'Estimated pay' : 'Your sales'}</h2>
          </div>
          <p>{showPay
            ? `${paySales.length} install${paySales.length === 1 ? '' : 's'} · estimate — tick one off once it lands`
            : `${listSales.length} record${listSales.length === 1 ? '' : 's'} · select a row to inspect`}</p>
        </div>

        <nav className="sales-line-tabs" aria-label="Sales views">
            <button className="sales-line-tab" role="tab" type="button" aria-selected={!showPay} onClick={() => { setSelectedId(null); setFiberView(null); onPayViewChange?.(false); }}>All</button>
            <button className="sales-line-tab" role="tab" type="button" aria-selected={showPay} onClick={() => { setSelectedId(null); setFiberView(null); onPayViewChange?.(true); }}>Pay</button>
        </nav>

        {fiberOrders.length > 0 && (
          <div className="sales-line-fiber-chips" role="group" aria-label="Fiber status views">
            <button
              type="button"
              className="sales-line-fiber-ledger-chip sales-line-fiber-ledger-chip-sent"
              aria-pressed={fiberView === null}
              onClick={() => { setSelectedId(null); setFiberView(null); onPayViewChange?.(false); }}
            >
              <span>Sent in</span>{' '}<strong>{monthSales.length}</strong>
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
                  className={`sales-line-fiber-ledger-chip sales-line-fiber-ledger-chip-${key}`}
                  aria-pressed={fiberView === key}
                  onClick={() => { setSelectedId(null); setFiberView(key); onPayViewChange?.(false); }}
                >
                  <span>{label}</span>{' '}<strong>{fiberBucketCounts[key]}</strong>
                </button>
              );
            })}
          </div>
        )}

        {showFiberView ? (
          <div className="sales-line-fiber-ledger">
            <p className="sales-line-fiber-report-note">
              From the provider report · updated {formatDate(fiber?.data?.lastReportAt)}
            </p>
            <FiberRows orders={fiberBucketOrders} />
          </div>
        ) : showPay ? (
        <div className="sales-line-table-wrap">
          {!hasPlan && (
            <p className="sales-line-pay-note">No pay plan assigned yet — ask an admin to set your role.</p>
          )}
          {/* Stated once, above the money, rather than as a footnote under it. */}
          <p className="sales-line-pay-disclaimer">
            An estimate, not a statement of pay. Chargebacks, claims and cancellations are
            not included here, and the carrier&rsquo;s final report decides what actually pays.
            Tick a sale off yourself once the money lands.
          </p>
          <div className={`sales-line-sale-row sales-line-pay-row thead${hasPlan ? '' : ' no-money'}`}>
            <span>Customer</span>{hasPlan && <span className="sales-line-pay-head-money">Estimated pay</span>}<span>Installed</span><span>Status</span><span>Paid</span>
          </div>
          <div className="sales-line-sale-list">
            {paySales.length ? paySales.map((sale) => {
              const expected = expectedBySale[sale.id || ''] ?? null;
              const paid = !!paidBySale[sale.id || ''];
              return (
                <div
                  className={`sales-line-sale-row sales-line-pay-row ${sale.status}${hasPlan ? '' : ' no-money'}`}
                  key={sale.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(sale.id || null)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(sale.id || null); }}
                >
                  <div className="sales-line-customer-cell"><strong>{sale.customerName || sale.customerAddress || 'Customer pending'}</strong><span>{productSummary(sale)}</span></div>
                  {hasPlan && (
                    <div className={`sales-line-money${expected ? '' : ' sales-line-rate-pending'}`}>
                      {formatMoney(expected || 0)}{!expected && <small>rate pending</small>}
                    </div>
                  )}
                  <div className="sales-line-date-cell"><strong>{formatDate(sale.installDate)}</strong><span>Sold {formatDate(sale.saleDate)}</span></div>
                  <div className="sales-line-status-cell">
                    <StatusBadge status={sale.status} />
                    {fiberBySale.get(sale.id || '') && <FiberStatusPill status={fiberBySale.get(sale.id || '')!.status} />}
                  </div>
                  <div
                    className="sales-line-paid-cell"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <label className="sales-line-paid-toggle">
                      <input
                        type="checkbox"
                        checked={paid}
                        onChange={() => void togglePaid(sale.id || '')}
                        aria-label={`Mark pay received for ${sale.customerName || sale.customerAddress || 'this sale'}`}
                      />
                      <span className="sales-line-paid-label">Paid</span>
                    </label>
                  </div>
                </div>
              );
            }) : <div className="sales-line-ledger-empty">
                {month ? `Nothing installed in ${monthLabel(month)}.` : 'Nothing installed yet.'}
                {' '}Pay shows up here once a sale has an install date.
                {month && <><br />Earlier months are behind the &lsquo;&lsaquo;&rsquo; arrow above.</>}
              </div>}
          </div>
          <div className={`sales-line-totals sales-line-pay-totals${hasPlan ? '' : ' no-money'}`}>
            <span><b>Sales</b><strong>{paySales.length}</strong></span>{hasPlan && <span className="sales-line-total-commission"><b>Estimated pay</b>{expectedTotalLabel}</span>}<span /><span /><span />
          </div>
        </div>
        ) : (
        <div className="sales-line-table-wrap">
          <div className="sales-line-sale-row thead">
            <span>Customer</span><span>Rep</span><span>Install / Sold</span><span>Value</span><span>Estimated pay</span><span>Status</span><span>Actions</span>
          </div>
          <div className="sales-line-sale-list">
            {listSales.length ? listSales.map((sale) => (
              <div
                className={`sales-line-sale-row ${sale.status}`}
                key={sale.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(sale.id || null)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(sale.id || null); }}
              >
                <div className="sales-line-customer-cell"><strong>{sale.customerName || sale.customerAddress || 'Customer pending'}</strong><span>{productSummary(sale)}</span></div>
                <div className="sales-line-rep-cell"><span className="sales-line-avatar">{repInitials(sale.salesRepName)}</span>{sale.salesRepName}</div>
                <div className="sales-line-date-cell"><strong>Install {sale.installDate ? formatDate(sale.installDate) : '—'}</strong><span>Sold {formatDate(sale.saleDate)}</span></div>
                <div className="sales-line-money">{formatMoney(sale.totalValue || 0)}<small>/mo</small></div>
                <div className="sales-line-money">{expectedLabel(expectedBySale[sale.id || ''])}</div>
                <div className="sales-line-status-cell">
                  <StatusBadge status={sale.status} />
                  {fiberBySale.get(sale.id || '') && <FiberStatusPill status={fiberBySale.get(sale.id || '')!.status} />}
                </div>
                <div className="sales-line-actions-cell">{rowActions(sale)}</div>
              </div>
            )) : <div className="sales-line-ledger-empty">
                {month ? `No sales sold in ${monthLabel(month)}.` : 'No sales yet.'}
                {month && <><br />Your earlier sales are still here — tap &lsquo;&lsaquo;&rsquo; above to go back a month.</>}
              </div>}
          </div>
          <div className="sales-line-totals">
            <span><b>Sales</b><strong>{listSales.length}</strong></span><span /><span /><span className="sales-line-total-value"><b>Value</b>{formatMoney(totalValue)}</span><span className="sales-line-total-commission"><b>Estimated pay</b>{expectedTotalLabel}</span><span /><span />
          </div>
        </div>
        )}
      </section>

      <SaleDetailSheet
        sale={selectedSale}
        index={selectedIndex}
        total={listSales.length}
        open={!!selectedSale}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        onPrev={() => moveSelection(-1)}
        onNext={() => moveSelection(1)}
        isAdmin={isAdmin}
        loading={loading}
        onRequestDelete={(id) => setDeletingId(id)}
      />

      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sale</DialogTitle>
            <DialogDescription>Are you sure you want to delete this sale? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={loading} onClick={() => void handleDelete()}>Delete Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
