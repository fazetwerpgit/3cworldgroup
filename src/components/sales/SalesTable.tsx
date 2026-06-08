'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ClipboardList, Eye, Pencil, Trash2, X } from 'lucide-react';
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
}

const statusColors: Record<SaleStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-700',
};

export function SalesTable({ sales, onApprove, onDelete, loading }: SalesTableProps) {
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

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
    return (
      <Card className="rounded-lg border-gray-200 p-8 text-center shadow-sm">
        <ClipboardList className="mx-auto mb-3 size-12 text-gray-300" />
        <p className="text-gray-500">No sales found</p>
        <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
          <Link href="/portal/sales/new">Log New Sale</Link>
        </Button>
      </Card>
    );
  }

  return (
    <>
      {/* Mobile Card Layout */}
      <div className="lg:hidden space-y-4">
        {sales.map((sale) => (
          <Card key={sale.id} className="rounded-lg border-gray-200 py-4 shadow-sm">
            <CardContent className="px-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{sale.customerName || sale.customerAddress || 'Customer pending'}</h3>
                {sale.customerPhone && (
                  <p className="text-sm text-gray-500">{sale.customerPhone}</p>
                )}
              </div>
              <Badge variant="outline" className={statusColors[sale.status]}>
                {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <p className="text-gray-500 text-xs">Sales Rep</p>
                <p className="text-gray-900">{sale.salesRepName}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Date</p>
                <p className="text-gray-900">{formatDate(sale.saleDate)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Value</p>
                <p className="text-gray-900 font-medium">{formatCurrency(sale.totalValue)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Commission</p>
                <p className="text-[#8dc63f] font-medium">+{formatCurrency(sale.commission || 0)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href={`/portal/sales/${sale.id}`}>
                  <Eye className="size-4" />
                  View
                </Link>
              </Button>
              {isAdmin && (
                <>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/portal/sales/${sale.id}/edit`}>
                      <Pencil className="size-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteModal(sale.id!)}
                    disabled={loading}
                    className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </>
              )}
              {canApprove && sale.status === 'pending' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleApprove(sale.id!)}
                    disabled={loading}
                    className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    <Check className="size-4" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRejectModal(sale.id!)}
                    disabled={loading}
                    className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  >
                    <X className="size-4" />
                    Reject
                  </Button>
                </>
              )}
            </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden lg:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Sales Rep</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id} className="hover:bg-gray-50/80">
                  <TableCell className="whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {sale.customerName || sale.customerAddress || 'Customer pending'}
                      </div>
                      {sale.customerPhone && (
                        <div className="text-sm text-gray-500">{sale.customerPhone}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm text-gray-900">{sale.salesRepName}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatDate(sale.saleDate)}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(sale.totalValue)}
                    </div>
                    <div className="text-xs text-[#8dc63f]">
                      +{formatCurrency(sale.commission || 0)} commission
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="outline" className={statusColors[sale.status]}>
                      {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/portal/sales/${sale.id}`}>
                          <Eye className="size-4" />
                        View
                        </Link>
                      </Button>
                      {isAdmin && (
                        <>
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/portal/sales/${sale.id}/edit`}>
                              <Pencil className="size-4" />
                            Edit
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDeleteModal(sale.id!)}
                            disabled={loading}
                            className="text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </>
                      )}
                      {canApprove && sale.status === 'pending' && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(sale.id!)}
                            disabled={loading}
                            className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
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
                            className="text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            <X className="size-4" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!showRejectModal} onOpenChange={(open) => {
        if (!open) {
          setShowRejectModal(null);
          setRejectionReason('');
        }
      }}>
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

      <Dialog open={!!showDeleteModal} onOpenChange={(open) => {
        if (!open) setShowDeleteModal(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sale? This action cannot be undone and will permanently remove the sale record.
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
