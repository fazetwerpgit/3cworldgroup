'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  FileText,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Button } from '@/components/ui/button';
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
import { auth } from '@/lib/firebase/config';
import { ChatLightbox } from '@/components/chat/ChatLightbox';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { FIBER_COMPANIES, Sale } from '@/types';

function companyLabel(company: string) {
  return FIBER_COMPANIES.find((item) => item.value === company)?.label || company;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | undefined) {
  if (!value) return 'Not provided';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function commissionLabel(value: number | undefined) {
  return typeof value === 'number' ? formatMoney(value) : '—';
}

function dateLabel() {
  const now = new Date();
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now).toUpperCase(),
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase(),
  };
}

function Mast() {
  const { month, weekday } = dateLabel();
  return (
    <div className="sales-line-mast">
      <span className="sales-line-mark">3C WORLD GROUP / THE LINE / SALES</span>
      <span className="sales-line-mast-meta">{month} · {weekday}</span>
    </div>
  );
}

function SalesLineShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="sales-line-main flex-1 overflow-auto">
          <div className="sales-line">{children}</div>
        </main>
      </div>
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
  const [proofLoading, setProofLoading] = useState(false);
  const [proofImage, setProofImage] = useState<LightboxImage | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

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

  const openScreenshot = async () => {
    if (!sale?.proofScreenshotPath) return;
    setProofLoading(true);
    setProofError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(
        `/api/portal/forms/attachment?path=${encodeURIComponent(sale.proofScreenshotPath)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error('Could not load the screenshot. Try again.');
      setProofImage({ url: data.url, alt: 'Sale proof screenshot' });
    } catch {
      setProofError('Could not load the screenshot. Try again.');
    } finally {
      setProofLoading(false);
    }
  };

  if (loading && !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <SalesLineShell>
          <Mast />
          <div className="sales-line-state-panel">
            <div className="sales-line-spinner" aria-hidden="true" />
            <p>Loading sale details...</p>
          </div>
        </SalesLineShell>
      </ProtectedRoute>
    );
  }

  if (error || !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <SalesLineShell>
          <Mast />
          <div className="sales-line-state-panel">
            <TriangleAlert className="sales-line-icon-lg" aria-hidden="true" />
            <strong>Sale not found</strong>
            <p>{error || 'The sale you are looking for does not exist.'}</p>
            <Link className="sales-line-btn primary" href="/portal/sales">Back to Sales</Link>
          </div>
        </SalesLineShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <SalesLineShell>
        <Mast />

        <Link className="sales-line-back" href="/portal/sales">
          <ArrowLeft className="sales-line-icon" aria-hidden="true" />
          Back to sales
        </Link>

        <header className="sales-line-subhead">
          <div>
            <p className="sales-line-eyebrow">Sales workspace / detail</p>
            <h1>{sale.customerName || sale.customerAddress || 'Customer pending'}</h1>
            <p className="sales-line-subhead-id">ID: {sale.id}</p>
          </div>
          <div className="sales-line-subhead-actions">
            <span className={`sales-line-badge ${sale.status}`}>{sale.status}</span>
            {isAdmin && (
              <>
                <Link className="sales-line-btn" href={`/portal/sales/${sale.id}/edit`}>
                  <Pencil className="sales-line-icon" aria-hidden="true" />
                  Edit
                </Link>
                <button type="button" className="sales-line-btn danger" onClick={() => setShowDeleteModal(true)}>
                  <Trash2 className="sales-line-icon" aria-hidden="true" />
                  Delete
                </button>
              </>
            )}
          </div>
        </header>

        <div className="sales-line-body">
          <section className="sales-line-panel">
            <div className="sales-line-panel-head">
              <h2>Customer</h2>
            </div>
            <div className="sales-line-panel-body">
              <dl className="sales-line-field-list">
                <div>
                  <dt>Address</dt>
                  <dd className={sale.customerAddress ? '' : 'muted'}>
                    {sale.customerAddress
                      ? <><MapPin className="sales-line-inline-icon" aria-hidden="true" /> {sale.customerAddress}</>
                      : 'Not provided'}
                  </dd>
                </div>
                <div>
                  <dt>Name</dt>
                  <dd className={sale.customerName ? '' : 'muted'}>{sale.customerName || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd className={sale.customerPhone ? '' : 'muted'}>
                    {sale.customerPhone
                      ? <a href={`tel:${sale.customerPhone.replace(/[^0-9+]/g, '')}`}><Phone className="sales-line-inline-icon" aria-hidden="true" /> {sale.customerPhone}</a>
                      : 'Not provided'}
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd className={sale.customerEmail ? '' : 'muted'}>{sale.customerEmail || 'Not provided'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="sales-line-panel">
            <div className="sales-line-panel-head">
              <h2>Sale information</h2>
            </div>
            <div className="sales-line-panel-body">
              <dl className="sales-line-field-list">
                <div>
                  <dt>Sales rep</dt>
                  <dd>{sale.salesRepName || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Sale date</dt>
                  <dd>{formatDate(sale.saleDate)}</dd>
                </div>
                <div>
                  <dt>Install date</dt>
                  <dd className={sale.installDate ? '' : 'muted'}>{formatDate(sale.installDate)}</dd>
                </div>
                <div>
                  <dt>Sale type</dt>
                  <dd className="capitalize">{sale.saleType?.replace('_', ' ') || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(sale.createdAt)}</dd>
                </div>
              </dl>
              {sale.notes && (
                <div className="sales-line-notes-block">
                  <p className="sales-line-sheet-label">Rep notes</p>
                  <p className="sales-line-notes" style={{ color: 'var(--muted)' }}>{sale.notes}</p>
                </div>
              )}
            </div>
          </section>

          <section className="sales-line-panel">
            <div className="sales-line-panel-head">
              <h2>Plans sold</h2>
            </div>
            <div className="sales-line-panel-body">
              <div className="sales-line-plan-list">
                {sale.products?.map((product, index) => (
                  <div className="sales-line-plan-card" key={`${product.productId}-${index}`}>
                    <div>
                      <strong>{product.productName}</strong>
                      <span>{companyLabel(product.company)}</span>
                    </div>
                    <b>{formatMoney(product.totalPrice || product.unitPrice)}/mo</b>
                    <em>{product.points} pts</em>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="sales-line-panel">
            <div className="sales-line-panel-head">
              <h2>Summary</h2>
            </div>
            <div className="sales-line-panel-body">
              <div className="sales-line-summary">
                <div><small>Monthly value</small><strong>{formatMoney(sale.totalValue || 0)}</strong></div>
                <div><small>Commission</small><strong>{commissionLabel(sale.commission)}</strong></div>
                <div><small>Points</small><strong>{sale.totalPoints || 0}</strong></div>
              </div>
            </div>
          </section>

          <section className="sales-line-panel">
            <div className="sales-line-panel-head">
              <h2>Order / proof</h2>
            </div>
            <div className="sales-line-panel-body">
              <div className="sales-line-proof">
                {sale.orderNumberOrBtn && <span><FileText className="sales-line-proof-icon" aria-hidden="true" />{sale.orderNumberOrBtn}</span>}
                {sale.proofScreenshotPath ? (
                  <button type="button" onClick={() => void openScreenshot()} disabled={proofLoading}>
                    {proofLoading ? 'Opening proof...' : 'View proof screenshot'}
                  </button>
                ) : !sale.orderNumberOrBtn ? (
                  <span>No order number or proof attached</span>
                ) : null}
              </div>
              {proofError && <p className="sales-line-proof-error">{proofError}</p>}
            </div>
          </section>

          {(sale.status === 'approved' || sale.status === 'rejected') && sale.approvedBy && (
            <div className={`sales-line-audit-banner ${sale.status}`}>
              {sale.status === 'approved'
                ? <Check className="sales-line-icon" aria-hidden="true" />
                : <X className="sales-line-icon" aria-hidden="true" />}
              <div>
                <h3>{sale.status === 'approved' ? 'Approved' : 'Rejected'}</h3>
                <p>By {sale.approverName || sale.approvedBy} on {formatDate(sale.approvedAt)}</p>
                {sale.rejectionReason && <p>Reason: {sale.rejectionReason}</p>}
              </div>
            </div>
          )}
        </div>
      </SalesLineShell>
      <ChatLightbox image={proofImage} onClose={() => setProofImage(null)} />

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
            <Button type="button" onClick={() => void handleDelete()} disabled={deleting} variant="destructive">
              {deleting ? 'Deleting...' : 'Delete Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
