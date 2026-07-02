'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Pencil, Trash2, TriangleAlert, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import { Sale } from '@/types';

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-slate-950 dark:text-foreground">{value}</p>
    </div>
  );
}

export default function SaleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const { fetchSale, deleteSale, loading, error } = useSales();
  const [sale, setSale] = useState<Sale | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = isRole('admin');
  const saleId = params.id as string;

  useEffect(() => {
    async function loadSale() {
      const saleData = await fetchSale(saleId);
      setSale(saleData);
    }
    if (saleId) {
      loadSale();
    }
  }, [saleId, fetchSale]);

  const handleDelete = async () => {
    setDeleting(true);
    const success = await deleteSale(saleId);
    if (success) {
      router.push('/portal/sales');
    }
    setDeleting(false);
    setShowDeleteModal(false);
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300';
      case 'pending':
        return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300';
      case 'rejected':
        return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300';
      case 'cancelled':
        return 'border-gray-200 bg-gray-100 text-gray-700 dark:border-border dark:bg-muted dark:text-muted-foreground';
      default:
        return 'border-gray-200 bg-gray-100 text-gray-700 dark:border-border dark:bg-muted dark:text-muted-foreground';
    }
  };

  if (loading && !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <PortalShell>
          <Card className="mx-auto max-w-4xl rounded-lg border-slate-200 dark:border-border p-8 text-center shadow-sm">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
            <p className="mt-4 text-slate-500 dark:text-muted-foreground">Loading sale details...</p>
          </Card>
        </PortalShell>
      </ProtectedRoute>
    );
  }

  if (error || !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <PortalShell>
          <Card className="mx-auto max-w-md rounded-lg border-slate-200 dark:border-border p-8 text-center shadow-sm">
            <TriangleAlert className="mx-auto mb-4 size-12 text-red-500" />
            <p className="font-semibold text-slate-950 dark:text-foreground">Sale not found</p>
            <p className="mt-1 text-slate-500 dark:text-muted-foreground">{error || 'The sale you are looking for does not exist.'}</p>
            <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/portal/sales">Back to Sales</Link>
            </Button>
          </Card>
        </PortalShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <PortalShell>
        <div className="mx-auto max-w-[1100px] space-y-5">
          <Button
            asChild
            variant="ghost"
            className="text-slate-600 dark:text-muted-foreground hover:text-slate-950 dark:hover:text-foreground"
          >
            <Link href="/portal/sales" aria-label="Back to sales">
              <ArrowLeft className="size-4" />
              Back to sales
            </Link>
          </Button>

          <PortalPageHeader
            compact
            eyebrow="Sales workspace"
            title="Sale Details"
            description={`ID: ${sale.id}`}
            actions={
              <>
                <Badge variant="outline" className={getStatusColor(sale.status)}>
                  {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                </Badge>
                {isAdmin && (
                  <>
                    <Button asChild variant="outline">
                      <Link href={`/portal/sales/${sale.id}/edit`}>
                        <Pencil className="size-4" />
                        Edit
                      </Link>
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => setShowDeleteModal(true)}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </>
                )}
              </>
            }
          />

          <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <CardTitle className="text-[#0A1F44] dark:text-foreground">Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DetailField label="Address" value={sale.customerAddress || 'Not provided'} />
                <DetailField label="Name" value={sale.customerName || 'Not provided'} />
                <DetailField label="Phone" value={sale.customerPhone || 'Not provided'} />
                <DetailField label="Email" value={sale.customerEmail || 'Not provided'} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <CardTitle className="text-[#0A1F44] dark:text-foreground">Sale Information</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DetailField label="Sales Rep" value={sale.salesRepName} />
                <DetailField label="Sale Date" value={formatDate(sale.saleDate)} />
                <DetailField label="Sale Type" value={<span className="capitalize">{sale.saleType?.replace('_', ' ') || 'N/A'}</span>} />
                <DetailField label="Created" value={formatDate(sale.createdAt)} />
              </div>
              {sale.notes && (
                <div className="mt-4 border-t border-slate-100 dark:border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">Notes</p>
                  <p className="mt-1 font-medium text-slate-950 dark:text-foreground">{sale.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <CardTitle className="text-[#0A1F44] dark:text-foreground">Plans Sold</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="space-y-3">
                {sale.products?.map((product, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-foreground">{product.productName}</p>
                      <p className="text-sm text-slate-500 dark:text-muted-foreground">{product.company}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-950 dark:text-foreground">{formatCurrency(product.unitPrice)}/mo</p>
                      <p className="text-sm font-medium text-[#5a8f1f]">+{product.points} pts</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-[#0A1F44]/10 bg-[#0A1F44] py-0 text-white shadow-sm">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-white/60">Total Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(sale.totalValue || 0)}</p>
                  <p className="text-xs text-white/60">/month</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/60">Commission</p>
                  <p className="text-2xl font-bold">{formatCurrency(sale.commission || 0)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/60">Points</p>
                  <p className="text-2xl font-bold text-[#8dc63f]">+{sale.totalPoints || 0}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/60">Plans</p>
                  <p className="text-2xl font-bold">{sale.products?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {(sale.status === 'approved' || sale.status === 'rejected') && sale.approvedBy && (
            <Card className={`rounded-lg shadow-sm ${sale.status === 'approved' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/15' : 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/15'}`}>
              <CardContent className="pt-6">
                <h2 className={`mb-2 flex items-center gap-2 text-lg font-semibold ${sale.status === 'approved' ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>
                  {sale.status === 'approved' ? <Check className="size-5" /> : <X className="size-5" />}
                  {sale.status === 'approved' ? 'Approved' : 'Rejected'}
                </h2>
                <p className={sale.status === 'approved' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                  By: {sale.approverName || sale.approvedBy} on {formatDate(sale.approvedAt)}
                </p>
                {sale.rejectionReason && (
                  <p className="mt-2 text-red-700 dark:text-red-300">
                    <span className="font-medium">Reason:</span> {sale.rejectionReason}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PortalShell>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sale? This action cannot be undone and will permanently remove the sale record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleDelete} disabled={deleting} variant="destructive">
              {deleting ? 'Deleting...' : 'Delete Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
