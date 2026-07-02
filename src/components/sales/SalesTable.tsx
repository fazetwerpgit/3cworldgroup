'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ClipboardList, Eye, Pencil, SearchX, Trash2, X } from 'lucide-react';
import { Sale, SaleStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface SalesTableProps {
  sales: Sale[];
  onApprove?: (saleId: string, status: 'approved' | 'rejected', reason?: string) => void;
  onDelete?: (saleId: string) => void;
  loading?: boolean;
  /** True when a status filter is active — switches the empty state copy. */
  filtered?: boolean;
  onClearFilter?: () => void;
}

const statusVariant: Record<SaleStatus, 'warning' | 'success' | 'danger' | 'secondary'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'secondary',
};

const statusEdge: Record<SaleStatus, string> = {
  pending: 'border-l-amber-400',
  approved: 'border-l-[#8dc63f]',
  rejected: 'border-l-red-400',
  cancelled: 'border-l-slate-300 dark:border-l-slate-600',
};

const daysSince = (date: Date | string | undefined) =>
  date ? Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000) : 0;

/** Stale-deal signal (ANCHOR §9): amber from 7 idle days, red from 14. */
function PendingAge({ sale }: { sale: Sale }) {
  if (sale.status !== 'pending') return null;
  const days = daysSince(sale.saleDate);
  if (days < 1) return null;
  const variant = days >= 14 ? 'danger' : days >= 7 ? 'warning' : 'secondary';
  return (
    <Badge variant={variant} className="portal-num rounded-md px-1.5 text-[11px]">
      {days}d
    </Badge>
  );
}

function repInitials(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function SalesTable({
  sales,
  onApprove,
  onDelete,
  loading,
  filtered = false,
  onClearFilter,
}: SalesTableProps) {
  const { hasPermission, isRole } = useAuth();
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const canApprove = hasPermission('sales:approve');
  const isAdmin = isRole('admin');

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const handleApprove = (saleId: string) => {
    if (onApprove) {
      onApprove(saleId, 'approved');
    }
  };

  const handleReject = (saleId: string) => {
    if (onApprove && rejectionReason) {
      onApprove(saleId, 'rejected', rejectionReason);
      setShowRejectModal(null);
      setRejectionReason('');
    }
  };

  const handleDelete = (saleId: string) => {
    if (onDelete) {
      onDelete(saleId);
      setShowDeleteModal(null);
    }
  };

  if (sales.length === 0) {
    // Two empty states: filtered-empty keeps the user oriented; true-empty
    // invites the first sale.
    return (
      <Card className="rounded-lg border-slate-200 bg-white p-10 text-center shadow-sm dark:border-border dark:bg-card">
        {filtered ? (
          <>
            <SearchX className="mx-auto mb-3 size-10 text-slate-300 dark:text-muted-foreground" />
            <p className="font-medium text-slate-950 dark:text-foreground">
              No sales match this filter
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              Try a different status, or clear the filter to see everything.
            </p>
            {onClearFilter && (
              <Button variant="outline" className="mt-4" onClick={onClearFilter}>
                Clear filter
              </Button>
            )}
          </>
        ) : (
          <>
            <ClipboardList className="mx-auto mb-3 size-10 text-slate-300 dark:text-muted-foreground" />
            <p className="font-medium text-slate-950 dark:text-foreground">No sales yet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              Your first logged sale starts the board.
            </p>
            <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/portal/sales/new">Log a sale</Link>
            </Button>
          </>
        )}
      </Card>
    );
  }

  const totalValue = sales.reduce((sum, s) => sum + (s.totalValue || 0), 0);
  const totalCommission = sales.reduce((sum, s) => sum + (s.commission || 0), 0);

  const rowActions = (sale: Sale, mobile = false) => {
    const revealClass = mobile
      ? ''
      : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100';
    return (
      <>
        {/* Quiet actions reveal on hover; decisive actions stay visible. */}
        <span className={`flex items-center gap-1 ${revealClass}`}>
          <Button asChild variant="ghost" size={mobile ? 'sm' : 'icon-sm'} title="View">
            <Link href={`/portal/sales/${sale.id}`} aria-label="View sale">
              <Eye className="size-4" />
              {mobile && 'View'}
            </Link>
          </Button>
          {isAdmin && (
            <>
              <Button asChild variant="ghost" size={mobile ? 'sm' : 'icon-sm'} title="Edit">
                <Link href={`/portal/sales/${sale.id}/edit`} aria-label="Edit sale">
                  <Pencil className="size-4" />
                  {mobile && 'Edit'}
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size={mobile ? 'sm' : 'icon-sm'}
                onClick={() => setShowDeleteModal(sale.id!)}
                disabled={loading}
                title="Delete"
                aria-label="Delete sale"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15"
              >
                <Trash2 className="size-4" />
                {mobile && 'Delete'}
              </Button>
            </>
          )}
        </span>
        {canApprove && sale.status === 'pending' && (
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApprove(sale.id!)}
              disabled={loading}
              className="border-[#8dc63f]/40 text-[#3f6212] hover:bg-[#8dc63f]/10 hover:text-[#3f6212] dark:text-[#d7ecc0] dark:hover:bg-[#8dc63f]/15"
            >
              <Check className="size-4" />
              Approve
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowRejectModal(sale.id!)}
              disabled={loading}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15"
            >
              <X className="size-4" />
              Reject
            </Button>
          </span>
        )}
      </>
    );
  };

  return (
    <>
      {/* Mobile: status-edged cards, phone-first. */}
      <div className="space-y-3 lg:hidden">
        {sales.map((sale) => (
          <Card
            key={sale.id}
            className={`rounded-lg border-slate-200 border-l-2 py-4 shadow-sm dark:border-border ${statusEdge[sale.status]}`}
          >
            <CardContent className="px-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-950 dark:text-foreground">
                    {sale.customerName || sale.customerAddress || 'Customer pending'}
                  </h3>
                  {sale.customerPhone && (
                    <p className="portal-num text-sm text-slate-500 dark:text-muted-foreground">
                      {sale.customerPhone}
                    </p>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <PendingAge sale={sale} />
                  <Badge variant={statusVariant[sale.status]} className="rounded-md">
                    {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                  </Badge>
                </span>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="portal-label text-[11px]">Rep</p>
                  <p className="mt-0.5 text-slate-950 dark:text-foreground">{sale.salesRepName}</p>
                </div>
                <div>
                  <p className="portal-label text-[11px]">Date</p>
                  <p className="portal-num mt-0.5 text-slate-950 dark:text-foreground">
                    {formatDate(sale.saleDate)}
                  </p>
                </div>
                <div>
                  <p className="portal-label text-[11px]">Value</p>
                  <p className="portal-num mt-0.5 font-medium text-slate-950 dark:text-foreground">
                    {formatCurrency(sale.totalValue)}
                  </p>
                </div>
                <div>
                  <p className="portal-label text-[11px]">Commission</p>
                  <p className="portal-num mt-0.5 font-medium text-[#3f6212] dark:text-[#d7ecc0]">
                    +{formatCurrency(sale.commission || 0)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-border">
                {rowActions(sale, true)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: financial-grade table. */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card lg:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Customer</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id} className="group h-12 hover:bg-slate-50/80 dark:hover:bg-muted/40">
                  <TableCell className="pl-4">
                    <span className="block max-w-56 truncate text-sm font-medium text-slate-950 dark:text-foreground">
                      {sale.customerName || sale.customerAddress || 'Customer pending'}
                    </span>
                    {sale.customerPhone && (
                      <span className="portal-num block text-xs text-slate-500 dark:text-muted-foreground">
                        {sale.customerPhone}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0A1F44]/8 text-[10px] font-semibold text-[#0A1F44] dark:bg-white/10 dark:text-white">
                        {repInitials(sale.salesRepName)}
                      </span>
                      <span className="max-w-40 truncate text-sm text-slate-700 dark:text-muted-foreground">
                        {sale.salesRepName}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="portal-num text-sm text-slate-700 dark:text-muted-foreground">
                    {formatDate(sale.saleDate)}
                  </TableCell>
                  <TableCell className="portal-num text-right text-sm font-medium text-slate-950 dark:text-foreground">
                    {formatCurrency(sale.totalValue)}
                  </TableCell>
                  <TableCell className="portal-num text-right text-sm text-[#3f6212] dark:text-[#d7ecc0]">
                    +{formatCurrency(sale.commission || 0)}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <Badge variant={statusVariant[sale.status]} className="rounded-md">
                        {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                      </Badge>
                      <PendingAge sale={sale} />
                    </span>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <span className="flex items-center justify-end gap-1">{rowActions(sale)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="bg-slate-50/80 dark:bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-4 text-xs font-medium text-slate-500 dark:text-muted-foreground" colSpan={3}>
                  {sales.length} {sales.length === 1 ? 'sale' : 'sales'}
                </TableCell>
                <TableCell className="portal-num text-right text-sm font-semibold text-slate-950 dark:text-foreground">
                  {formatCurrency(totalValue)}
                </TableCell>
                <TableCell className="portal-num text-right text-sm font-medium text-[#3f6212] dark:text-[#d7ecc0]">
                  +{formatCurrency(totalCommission)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      <Dialog
        open={!!showRejectModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowRejectModal(null);
            setRejectionReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Sale</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this sale:
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            placeholder="Enter rejection reason..."
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowRejectModal(null);
                setRejectionReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => showRejectModal && handleReject(showRejectModal)}
              disabled={!rejectionReason || loading || !showRejectModal}
              variant="destructive"
            >
              Reject Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!showDeleteModal}
        onOpenChange={(open) => {
          if (!open) setShowDeleteModal(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sale? This action cannot be undone and will
              permanently remove the sale record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDeleteModal(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => showDeleteModal && handleDelete(showDeleteModal)}
              disabled={loading || !showDeleteModal}
              variant="destructive"
            >
              Delete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
