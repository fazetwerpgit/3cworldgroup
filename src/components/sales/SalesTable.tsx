'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, FileText, Pencil, Trash2, X } from 'lucide-react';
import { Sale, SaleStatus, FIBER_COMPANIES } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
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
}: SalesTableProps) {
  const { hasPermission, isRole } = useAuth();
  const canApprove = hasPermission('sales:approve');
  const isAdmin = isRole('admin');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const visibleSales = useMemo(
    () => (statusFilter ? sales.filter((sale) => sale.status === statusFilter) : sales),
    [sales, statusFilter]
  );
  const pendingSales = useMemo(
    () => [...sales].filter((sale) => sale.status === 'pending').sort((a, b) => ageDays(b) - ageDays(a)),
    [sales]
  );
  const selectedIndex = selectedId ? visibleSales.findIndex((sale) => sale.id === selectedId) : -1;
  const selectedSale = selectedIndex >= 0 ? visibleSales[selectedIndex] : null;
  const totalValue = visibleSales.reduce((sum, sale) => sum + (sale.totalValue || 0), 0);
  const commissionValues = visibleSales.flatMap((sale) => typeof sale.commission === 'number' ? [sale.commission] : []);
  const totalCommission = commissionValues.reduce((sum, value) => sum + value, 0);
  const commissionLabel = commissionValues.length ? formatMoney(totalCommission) : '—';

  const moveSelection = useCallback((direction: number) => {
    if (!visibleSales.length) return;
    const current = visibleSales.findIndex((sale) => sale.id === selectedId);
    const next = (current + direction + visibleSales.length) % visibleSales.length;
    setSelectedId(visibleSales[next]?.id || null);
  }, [selectedId, visibleSales]);

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
            <p className="sales-line-eyebrow">{canApprove ? 'The ledger / all statuses' : 'Your ledger / all statuses'}</p>
            <h2>{canApprove ? 'The rest of the month' : 'Your sales'}</h2>
          </div>
          <p>{visibleSales.length} recent records · click a row to inspect</p>
        </div>

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

        <div className="sales-line-table-wrap">
          <div className="sales-line-sale-row thead">
            <span>Customer</span><span>Rep</span><span>Install / Sold</span><span>Value</span><span>Commission</span><span>Status</span><span>Actions</span>
          </div>
          <div className="sales-line-sale-list">
            {visibleSales.length ? visibleSales.map((sale) => (
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
                <div className="sales-line-money">{typeof sale.commission === 'number' ? formatMoney(sale.commission) : '—'}</div>
                <div className="sales-line-status-cell"><StatusBadge status={sale.status} />{sale.status === 'pending' && <span className={`sales-line-stale ${ageTone(sale)}`}>{ageLabel(sale)}</span>}</div>
                <div className="sales-line-actions-cell">{rowActions(sale)}</div>
              </div>
            )) : <div className="sales-line-ledger-empty">{statusFilter ? `No ${statusFilter} sales in this view.` : `No sales in ${canApprove ? 'the ledger' : 'your book'}.`}</div>}
          </div>
          <div className="sales-line-totals">
            <span><strong>{visibleSales.length}</strong> visible</span><span /><span /><span className="sales-line-total-value">{formatMoney(totalValue)}</span><span className="sales-line-total-commission">{commissionLabel}</span><span /><span />
          </div>
        </div>
      </section>

      <SaleDetailSheet
        sale={selectedSale}
        index={selectedIndex}
        total={visibleSales.length}
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

      <div className={`sales-line-toast ${toastMessage ? 'show' : ''}`} role="status">{toastMessage}</div>
    </>
  );
}
