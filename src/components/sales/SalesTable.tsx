'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, FileText, Pencil, Trash2, X } from 'lucide-react';
import { Sale, SaleStatus, FIBER_COMPANIES, PAY_DELAY_DAYS } from '@/types';
import type { CompPlanCompanyRates } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useSalePaid } from '@/hooks/useSalePaid';
import { expectedPayDate, expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SaleDetailSheet } from './SaleDetailSheet';

interface SalesTableProps {
  sales: Sale[];
  statusFilter: SaleStatus | '';
  onStatusFilterChange: (status: SaleStatus | '') => void;
  onApprove?: (saleId: string, status: 'approved' | 'rejected', reason?: string) => void | Promise<boolean>;
  onDelete?: (saleId: string) => void | Promise<boolean>;
  loading?: boolean;
  /** Reps only: the [All | Pay] selection, held by the page (never in ?status=). */
  payView?: boolean;
  onPayViewChange?: (payView: boolean) => void;
  /** The viewer's own comp-plan slice. Absent/planless reps see no dollar figures. */
  payPlan?: { rates: CompPlanCompanyRates | null; payDelayDays: number; hasPlan: boolean };
}

const STATUS_TABS: { value: SaleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | undefined) {
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

function ageDays(sale: Sale) {
  return Math.max(0, Math.floor((Date.now() - new Date(sale.saleDate).getTime()) / 86_400_000));
}

function ageLabel(sale: Sale) {
  const days = ageDays(sale);
  return days === 0 ? 'Today' : `${days}d idle`;
}

function ageTone(sale: Sale) {
  const days = ageDays(sale);
  return days >= 14 ? 'red' : days >= 7 ? 'amber' : '';
}

function expectedLabel(value: number | null | undefined) {
  return typeof value === 'number' ? formatMoney(value) : '—';
}

function StatusBadge({ status }: { status: SaleStatus }) {
  return <span className={`sales-line-badge ${status}`}>{status}</span>;
}

export function SalesTable({
  sales,
  statusFilter,
  onStatusFilterChange,
  onApprove,
  onDelete,
  loading = false,
  payView = false,
  onPayViewChange,
  payPlan,
}: SalesTableProps) {
  const { user, hasPermission, isRole } = useAuth();
  const canApprove = hasPermission('sales:approve');
  const isAdmin = isRole('admin');
  // Everything below the ledger head forks here: management keeps the five
  // status tabs and the approval queue, reps get [All | Pay].
  const repMode = !canApprove;
  const showPay = repMode && payView;
  const rates = payPlan?.rates ?? null;
  const hasPlan = !!payPlan?.hasPlan;
  const payDelayDays = payPlan?.payDelayDays ?? PAY_DELAY_DAYS;
  const { paidBySale, togglePaid } = useSalePaid(repMode ? user?.uid : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Reps have no status tabs to filter with, so their ledger is always the whole book.
  const visibleSales = useMemo(
    () => (statusFilter && canApprove ? sales.filter((sale) => sale.status === statusFilter) : sales),
    [canApprove, sales, statusFilter]
  );
  // Pay is owed off the install, so a sale without an install date has nothing
  // to show yet, and a dead sale never will. Newest install first — that is the
  // money arriving soonest.
  const paySales = useMemo(
    () => sales
      .filter((sale) => !!sale.installDate && isPayableSale(sale))
      .sort((a, b) => new Date(b.installDate!).getTime() - new Date(a.installDate!).getTime()),
    [sales]
  );
  const expectedBySale = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (!repMode) return map;
    for (const sale of sales) {
      map[sale.id || ''] = isPayableSale(sale) ? expectedPayForSale(sale, rates) : null;
    }
    return map;
  }, [rates, repMode, sales]);

  const pendingSales = useMemo(
    () => [...sales].filter((sale) => sale.status === 'pending').sort((a, b) => ageDays(b) - ageDays(a)),
    [sales]
  );
  // The rows actually on screen — the ledger, or the rep's pay list.
  const listSales = showPay ? paySales : visibleSales;
  const selectedIndex = selectedId ? listSales.findIndex((sale) => sale.id === selectedId) : -1;
  const selectedSale = selectedIndex >= 0 ? listSales[selectedIndex] : null;
  const totalValue = listSales.reduce((sum, sale) => sum + (sale.totalValue || 0), 0);
  const commissionValues = listSales.flatMap((sale) => typeof sale.commission === 'number' ? [sale.commission] : []);
  const totalCommission = commissionValues.reduce((sum, value) => sum + value, 0);
  const commissionLabel = commissionValues.length ? formatMoney(totalCommission) : '—';
  const expectedTotal = hasPlan
    ? listSales.reduce((sum, sale) => sum + (expectedBySale[sale.id || ''] ?? 0), 0)
    : null;
  const expectedTotalLabel = expectedLabel(expectedTotal);

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

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(''), 1800);
  };

  const decide = async (saleId: string, status: 'approved' | 'rejected', reason?: string): Promise<boolean> => {
    if (!onApprove) return false;
    const result = await onApprove(saleId, status, reason);
    if (result !== false) showToast(status === 'approved' ? 'Sale approved' : 'Sale rejected');
    return result !== false;
  };

  const handleReject = async () => {
    if (!rejectingId || !rejectionReason.trim()) return;
    const id = rejectingId;
    setRejectingId(null);
    setRejectionReason('');
    await decide(id, 'rejected', rejectionReason.trim());
  };

  const handleDelete = async () => {
    if (!deletingId || !onDelete) return;
    const id = deletingId;
    setDeletingId(null);
    await onDelete(id);
  };

  const rowActions = (sale: Sale) => {
    if (canApprove && sale.status === 'pending') {
      return (
        <span className="sales-line-row-actions" onClick={(event) => event.stopPropagation()}>
          <button className="approve" type="button" disabled={loading} onClick={() => void decide(sale.id || '', 'approved')}>
            <Check className="sales-line-action-icon" />Approve
          </button>
          <button className="reject" type="button" disabled={loading} onClick={() => setRejectingId(sale.id || null)}>
            <X className="sales-line-action-icon" />Reject
          </button>
        </span>
      );
    }

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
      {/* Reps get the richer "Submitted / in review" section on the page above
          instead of this queue — rendering both would duplicate the list. */}
      {canApprove && (
      <section className="sales-line-flow">
        <div className="sales-line-section-head">
          <div>
            <p className="sales-line-eyebrow">Priority ordered / manager queue</p>
            <h2>Needs your attention</h2>
          </div>
          <p>{pendingSales.length} pending · oldest first</p>
        </div>

        <div className="sales-line-priority-list">
          {pendingSales.length ? pendingSales.map((sale, index) => (
            <div className="sales-line-priority-row" key={sale.id} role="button" tabIndex={0} onClick={() => setSelectedId(sale.id || null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(sale.id || null); }}>
              <span className="sales-line-tick">{String(index + 1).padStart(2, '0')}</span>
              <FileText className="sales-line-priority-icon" aria-hidden="true" />
              <div className="sales-line-priority-copy">
                <strong>{sale.customerName || sale.customerAddress || 'Customer pending'} · {sale.salesRepName}</strong>
                <span>{productSummary(sale)} · {formatMoney(sale.totalValue || 0)}/mo · {sale.totalPoints || 0} pts</span>
              </div>
              <span className={`sales-line-age ${ageTone(sale)}`}>{ageLabel(sale)}</span>
              {canApprove && (
                <span className="sales-line-priority-actions" onClick={(event) => event.stopPropagation()}>
                  <button className="approve" type="button" disabled={loading} onClick={() => void decide(sale.id || '', 'approved')}>Approve</button>
                  <button className="reject" type="button" disabled={loading} onClick={() => setRejectingId(sale.id || null)}>Reject</button>
                </span>
              )}
            </div>
          )) : <div className="sales-line-empty-priority">No pending sales in your book.</div>}
        </div>
        <p className="sales-line-flow-note">Click any row to open the review sheet. Approve or reject without leaving the flow.</p>
      </section>
      )}

      <section className="sales-line-ledger">
        <div className="sales-line-ledger-head">
          <div>
            <p className="sales-line-eyebrow">{canApprove ? 'The ledger / all statuses' : showPay ? 'Your pay / installs and dates' : 'Your ledger / all statuses'}</p>
            <h2>{canApprove ? 'The rest of the month' : showPay ? 'What you get paid' : 'Your sales'}</h2>
          </div>
          <p>{showPay
            ? `${paySales.length} install${paySales.length === 1 ? '' : 's'} · tick one off once it lands`
            : `${listSales.length} recent records · click a row to inspect`}</p>
        </div>

        {repMode ? (
          <nav className="sales-line-tabs" aria-label="Sales views">
            <button className="sales-line-tab" role="tab" type="button" aria-selected={!showPay} onClick={() => { setSelectedId(null); onPayViewChange?.(false); }}>All</button>
            <button className="sales-line-tab" role="tab" type="button" aria-selected={showPay} onClick={() => { setSelectedId(null); onPayViewChange?.(true); }}>Pay</button>
          </nav>
        ) : (
        <nav className="sales-line-tabs" aria-label="Sale status filters">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const count = tab.value === 'pending' ? pendingSales.length : 0;
            return (
              <button key={tab.label} className="sales-line-tab" role="tab" type="button" aria-selected={active} onClick={() => { setSelectedId(null); onStatusFilterChange(tab.value); }}>
                {tab.label}{tab.value === 'pending' && <span className="sales-line-count-chip">{count}</span>}
              </button>
            );
          })}
        </nav>
        )}

        {showPay ? (
        <div className="sales-line-table-wrap">
          {!hasPlan && (
            <p className="sales-line-pay-note">No pay plan assigned yet — ask an admin to set your role.</p>
          )}
          <div className={`sales-line-sale-row sales-line-pay-row thead${hasPlan ? '' : ' no-money'}`}>
            <span>Customer</span>{hasPlan && <span className="sales-line-pay-head-money">Expected pay</span>}<span>Expected pay date</span><span>Status</span><span>Paid</span>
          </div>
          <div className="sales-line-sale-list">
            {paySales.length ? paySales.map((sale) => {
              const expected = expectedBySale[sale.id || ''] ?? null;
              const due = expectedPayDate(sale, payDelayDays);
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
                  <div className="sales-line-date-cell"><strong>{due ? formatDate(due) : '—'}</strong><span>Install {formatDate(sale.installDate)}</span></div>
                  <div className="sales-line-status-cell"><StatusBadge status={sale.status} /></div>
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
            }) : <div className="sales-line-ledger-empty">Nothing installed yet. Pay shows up here once a sale has an install date.</div>}
          </div>
          <div className={`sales-line-totals sales-line-pay-totals${hasPlan ? '' : ' no-money'}`}>
            <span><strong>{paySales.length}</strong> installs</span>{hasPlan && <span className="sales-line-total-commission">{expectedTotalLabel}</span>}<span /><span /><span />
          </div>
        </div>
        ) : (
        <div className="sales-line-table-wrap">
          <div className="sales-line-sale-row thead">
            <span>Customer</span><span>Rep</span><span>Install / Sold</span><span>Value</span><span>{repMode ? 'Expected pay' : 'Commission'}</span><span>Status</span><span>Actions</span>
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
                <div className="sales-line-money">{repMode ? expectedLabel(expectedBySale[sale.id || '']) : typeof sale.commission === 'number' ? formatMoney(sale.commission) : '—'}</div>
                <div className="sales-line-status-cell"><StatusBadge status={sale.status} />{sale.status === 'pending' && <span className={`sales-line-stale ${ageTone(sale)}`}>{ageLabel(sale)}</span>}</div>
                <div className="sales-line-actions-cell">{rowActions(sale)}</div>
              </div>
            )) : <div className="sales-line-ledger-empty">{statusFilter && canApprove ? `No ${statusFilter} sales in this view.` : `No sales in ${canApprove ? 'the ledger' : 'your book'}.`}</div>}
          </div>
          <div className="sales-line-totals">
            <span><strong>{listSales.length}</strong> visible</span><span /><span /><span className="sales-line-total-value">{formatMoney(totalValue)}</span><span className="sales-line-total-commission">{repMode ? expectedTotalLabel : commissionLabel}</span><span /><span />
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
        canApprove={canApprove}
        isAdmin={isAdmin}
        loading={loading}
        onApprove={(id) => decide(id, 'approved')}
        onRequestReject={(id) => setRejectingId(id)}
        onRequestDelete={(id) => setDeletingId(id)}
      />

      <Dialog open={!!rejectingId} onOpenChange={(open) => { if (!open) { setRejectingId(null); setRejectionReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject sale</DialogTitle>
            <DialogDescription>Please provide a reason for rejection. This will be shared with the sales rep.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} placeholder="Enter rejection reason..." />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setRejectingId(null); setRejectionReason(''); }}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={!rejectionReason.trim() || loading} onClick={() => void handleReject()}>Reject sale</Button>
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
            <Button type="button" variant="destructive" disabled={loading} onClick={() => void handleDelete()}>Delete sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portaled out of the <main> scroller: iOS WebKit mis-renders
          position:fixed inside it (see SaleDetailSheet). The .sales-line
          wrapper re-supplies the palette vars the toast reads. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="sales-line" style={{ display: 'contents' }}>
            <div className={`sales-line-toast ${toastMessage ? 'show' : ''}`} role="status">{toastMessage}</div>
          </div>,
          document.body
        )}
    </>
  );
}
