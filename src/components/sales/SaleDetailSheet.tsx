'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  X,
} from 'lucide-react';
import { Sale, FIBER_COMPANIES } from '@/types';
import { auth } from '@/lib/firebase/config';
import { ChatLightbox } from '@/components/chat/ChatLightbox';
import type { LightboxImage } from '@/components/chat/ChatLightbox';

interface SaleDetailSheetProps {
  sale: Sale | null;
  index: number;
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  canApprove: boolean;
  isAdmin: boolean;
  loading?: boolean;
  onApprove: (saleId: string) => void | Promise<boolean>;
  onRequestReject: (saleId: string) => void;
  onRequestDelete: (saleId: string) => void;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | undefined) {
  if (!value) return 'Not provided';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function commissionLabel(value: number | undefined) {
  return typeof value === 'number' ? formatMoney(value) : '—';
}

function companyLabel(company: string) {
  return FIBER_COMPANIES.find((item) => item.value === company)?.label || company;
}

function ageLabel(sale: Sale) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(sale.saleDate).getTime()) / 86_400_000));
  return days === 0 ? 'Today' : `${days}d idle`;
}

function ageTone(sale: Sale) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(sale.saleDate).getTime()) / 86_400_000));
  return days >= 14 ? 'red' : days >= 7 ? 'amber' : '';
}

function StatusBadge({ status }: { status: Sale['status'] }) {
  return <span className={`sales-line-badge ${status}`}>{status}</span>;
}

export function SaleDetailSheet({
  sale,
  index,
  total,
  open,
  onOpenChange,
  onPrev,
  onNext,
  canApprove,
  isAdmin,
  loading,
  onApprove,
  onRequestReject,
  onRequestDelete,
}: SaleDetailSheetProps) {
  const [proofLoading, setProofLoading] = useState(false);
  const [proofImage, setProofImage] = useState<LightboxImage | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  if (!sale) return null;

  const saleId = sale.id || '';
  const showApproval = canApprove && sale.status === 'pending';
  const tone = ageTone(sale);
  const openScreenshot = async () => {
    if (!sale.proofScreenshotPath) return;
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

  return (
    <>
      <button
        type="button"
        className={`sales-line-backdrop ${open ? 'is-open' : ''}`}
        aria-label="Close sale detail"
        tabIndex={open ? 0 : -1}
        onClick={() => onOpenChange(false)}
      />
      <aside
        className={`sales-line-detail-sheet ${open ? 'is-open' : ''}`}
        aria-hidden={!open}
        aria-label="Sale detail"
      >
        <div className="sales-line-sheet-top">
          <div>
            <p className="sales-line-eyebrow">Sale detail / {String(index + 1).padStart(2, '0')}</p>
            <h2>{sale.customerName || sale.customerAddress || 'Customer pending'}</h2>
          </div>
          <button className="sales-line-icon-button" type="button" onClick={() => onOpenChange(false)} aria-label="Close detail">
            <X className="sales-line-icon" aria-hidden="true" />
          </button>
        </div>

        <div className="sales-line-sheet-scroll">
          <div className="sales-line-sheet-status">
            <StatusBadge status={sale.status} />
            <span className={`sales-line-stale ${tone}`}>{sale.status === 'pending' ? ageLabel(sale) : formatDate(sale.saleDate)}</span>
          </div>

          <section className="sales-line-sheet-block">
            <span className="sales-line-sheet-label">Customer</span>
            <div className="sales-line-customer-detail">
              <strong>{sale.customerName || 'Customer pending'}</strong>
              {sale.customerPhone ? <a href={`tel:${sale.customerPhone.replace(/[^0-9+]/g, '')}`}><Phone className="sales-line-inline-icon" />{sale.customerPhone}</a> : <span>No phone provided</span>}
              <span><MapPin className="sales-line-inline-icon" />{sale.customerAddress || 'No address provided'}</span>
            </div>
          </section>

          <section className="sales-line-sheet-block">
            <span className="sales-line-sheet-label">Dates</span>
            <div className="sales-line-sheet-dates">
              <span>Sold <b>{formatDate(sale.saleDate)}</b></span>
              <span>Install <b>{formatDate(sale.installDate)}</b></span>
            </div>
          </section>

          <section className="sales-line-sheet-block">
            <span className="sales-line-sheet-label">Plans sold</span>
            <div className="sales-line-plans">
              {sale.products?.map((product, productIndex) => (
                <div className="sales-line-plan" key={`${product.productId}-${productIndex}`}>
                  <div>
                    <strong>{product.productName}</strong>
                    <span>{companyLabel(product.company)}</span>
                  </div>
                  <b>{formatMoney(product.totalPrice || product.unitPrice)}/mo</b>
                  <em>{product.points} pts</em>
                </div>
              ))}
            </div>
          </section>

          <div className="sales-line-summary">
            <div><small>Monthly value</small><strong>{formatMoney(sale.totalValue || 0)}</strong></div>
            <div><small>Commission</small><strong>{commissionLabel(sale.commission)}</strong></div>
            <div><small>Points</small><strong>{sale.totalPoints || 0}</strong></div>
          </div>

          <section className="sales-line-sheet-block">
            <span className="sales-line-sheet-label">Order / proof</span>
            <div className="sales-line-proof">
              {sale.orderNumberOrBtn && <span><FileText className="sales-line-proof-icon" />{sale.orderNumberOrBtn}</span>}
              {sale.proofScreenshotPath ? (
                <button type="button" onClick={() => void openScreenshot()} disabled={proofLoading}>
                  {proofLoading ? 'Opening proof...' : 'View proof screenshot'}
                </button>
              ) : !sale.orderNumberOrBtn ? (
                <span>No order number or proof attached</span>
              ) : null}
            </div>
            {proofError && <p className="sales-line-proof-error">{proofError}</p>}
          </section>

          <section className="sales-line-sheet-block">
            <span className="sales-line-sheet-label">Rep notes</span>
            <p className="sales-line-notes">{sale.notes || 'No notes added.'}</p>
          </section>

          <div className="sales-line-sheet-actions">
            {showApproval && (
              <>
                <button className="approve" type="button" disabled={loading} onClick={() => void onApprove(saleId)}>
                  <Check className="sales-line-icon" />Approve sale
                </button>
                <button className="reject" type="button" disabled={loading} onClick={() => onRequestReject(saleId)}>
                  <X className="sales-line-icon" />Reject sale
                </button>
              </>
            )}
            {isAdmin && (
              <>
                <Link className="admin" href={`/portal/sales/${saleId}/edit`}>
                  <Pencil className="sales-line-icon" />Edit
                </Link>
                <button className="admin" type="button" disabled={loading} onClick={() => onRequestDelete(saleId)}>
                  <Trash2 className="sales-line-icon" />Delete
                </button>
              </>
            )}
          </div>

          {total > 1 && (
            <div className="sales-line-sheet-nav">
              <button type="button" onClick={onPrev}><ChevronLeft className="sales-line-icon" />Previous</button>
              <span>{index + 1} / {total}</span>
              <button type="button" onClick={onNext}>Next<ChevronRight className="sales-line-icon" /></button>
            </div>
          )}
          <Link className="sales-line-open-full" href={`/portal/sales/${saleId}`}>
            Open full page <ArrowUpRight className="sales-line-icon" />
          </Link>
        </div>
      </aside>
      <ChatLightbox image={proofImage} onClose={() => setProofImage(null)} />
    </>
  );
}
