'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  Trash2,
  Ban,
  X,
} from 'lucide-react';
import { Sale, FIBER_COMPANIES } from '@/types';
import { auth } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/hooks/useSales';
import { dateToSaleDateInput, parseInstallDateInput, todaySaleDateInput } from '@/lib/sales/saleDate';
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
  isAdmin: boolean;
  loading?: boolean;
  onRequestDelete: (saleId: string) => void;
  /** Admin-only. Omitted on the rep view, where the buttons never render. */
  onRequestCancel?: (saleId: string) => void;
  onRestore?: (saleId: string) => void;
  /**
   * Called after the install date is saved, so the list behind the sheet
   * refetches. Optional: the sheet already shows the new date on its own.
   */
  onSaleUpdated?: () => void;
}

const INSTALL_DATE_ERROR = 'Could not save the install date. Try again.';

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'Not provided';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * A stored install date as a Date. Firestore hands back either a Date or a
 * string; a plain YYYY-MM-DD goes through parseInstallDateInput so it lands on
 * local noon like every other sale date, instead of UTC midnight — which reads
 * as the previous day west of Greenwich.
 */
function installDateAsDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = parseInstallDateInput(value);
  if (parsed.ok) return parsed.date;
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
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
  isAdmin,
  loading,
  onRequestDelete,
  onRequestCancel,
  onRestore,
  onSaleUpdated,
}: SaleDetailSheetProps) {
  const [proofLoading, setProofLoading] = useState(false);
  const [proofImage, setProofImage] = useState<LightboxImage | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  // A customer reschedules and the rep needs the install date moved from their
  // phone, on the row they are already looking at. The API has always allowed
  // it (a rep may edit their own sale); only the UI held it back, and the full
  // edit page stays admin-only — this is the one field a rep can correct here.
  const { user } = useAuth();
  const { updateSale } = useSales();
  /** The value in the date input, or null when the row is not being edited. */
  const [installDraft, setInstallDraft] = useState<string | null>(null);
  const [savingInstall, setSavingInstall] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  // Shows the saved date immediately, before the parent's refetch lands.
  const [installSaved, setInstallSaved] = useState<{ saleId: string; date: Date } | null>(null);

  const currentSaleId = sale?.id || '';
  useEffect(() => {
    setInstallDraft(null);
    setInstallError(null);
    setSavingInstall(false);
  }, [currentSaleId]);

  // Ref keeps the effects below on [open] only: callers pass an inline
  // onOpenChange, and re-running the history effect per render would push a
  // history entry per keystroke.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChangeRef.current(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // On phones the sheet covers the whole screen, so the back gesture/button
  // must close it — not navigate away from the sales page. Opening pushes a
  // history entry; back pops it and closes the sheet; closing any other way
  // (X, backdrop, Escape) consumes the entry so history stays balanced.
  const historyPushedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ saleDetailSheet: true }, '');
    historyPushedRef.current = true;
    const onPopState = () => {
      historyPushedRef.current = false;
      onOpenChangeRef.current(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (historyPushedRef.current) {
        historyPushedRef.current = false;
        window.history.back();
      }
    };
  }, [open]);

  // Links inside the sheet navigate forward; the cleanup's history.back() would
  // undo that navigation the moment the sheet unmounts. Disowning the entry
  // before the router acts leaves an inert duplicate list entry behind instead
  // — back from the target page still lands on the sales list as expected.
  const disownHistoryEntry = () => {
    historyPushedRef.current = false;
  };

  if (!sale || typeof document === 'undefined') return null;

  const saleId = sale.id || '';
  const tone = ageTone(sale);
  const storedInstallDate = installDateAsDate(sale.installDate);
  const shownInstallDate = installSaved && installSaved.saleId === saleId
    ? installSaved.date
    : storedInstallDate;
  // The owning rep, or an admin. A cancelled sale has no install to move.
  const canEditInstallDate =
    sale.status !== 'cancelled' && (isAdmin || (!!user?.uid && sale.salesRepId === user.uid));

  const startEditingInstall = () => {
    setInstallError(null);
    setInstallDraft(shownInstallDate ? dateToSaleDateInput(shownInstallDate) : todaySaleDateInput());
  };

  const cancelEditingInstall = () => {
    setInstallDraft(null);
    setInstallError(null);
  };

  const saveInstallDate = async () => {
    if (installDraft === null || savingInstall) return;
    const parsed = parseInstallDateInput(installDraft);
    if (!parsed.ok) {
      setInstallError(INSTALL_DATE_ERROR);
      return;
    }
    setSavingInstall(true);
    setInstallError(null);
    const ok = await updateSale(saleId, { installDate: installDraft });
    setSavingInstall(false);
    if (!ok) {
      setInstallError(INSTALL_DATE_ERROR);
      return;
    }
    setInstallSaved({ saleId, date: parsed.date });
    setInstallDraft(null);
    onSaleUpdated?.();
  };

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

  // Portaled to <body>: on iPhones the portal locks scrolling into <main>
  // (app-shell scroll lock), and iOS WebKit breaks position:fixed inside that
  // scroller — the sheet gets clipped to main's box and painted UNDER the
  // fixed header/bottom nav, hiding the close X with no way out. The
  // display:contents wrapper re-supplies the .sales-line custom-property
  // palette the sheet's styles read, without generating a layout box.
  return createPortal(
    <div className="sales-line" style={{ display: 'contents' }}>
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

          {sale.status === 'cancelled' && (
            <p className="sales-line-cancelled-note">
              Cancelled {sale.cancelledAt ? formatDate(sale.cancelledAt) : ''}
              {sale.cancellerName ? ` by ${sale.cancellerName}` : ''}
              {sale.cancelReason ? ` — ${sale.cancelReason}` : '. No reason given.'}
            </p>
          )}

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
              <span>
                Install <b>{formatDate(shownInstallDate)}</b>
                {canEditInstallDate && installDraft === null && (
                  <button
                    className="sales-line-date-change"
                    type="button"
                    onClick={startEditingInstall}
                  >
                    Change
                  </button>
                )}
              </span>
            </div>
            {installDraft !== null && (
              <div className="sales-line-date-editor">
                <label className="sales-line-date-editor-label" htmlFor="sale-install-date">
                  Install date
                </label>
                <input
                  id="sale-install-date"
                  className="sales-line-date-input"
                  type="date"
                  value={installDraft}
                  disabled={savingInstall}
                  onChange={(event) => setInstallDraft(event.target.value)}
                />
                <div className="sales-line-date-editor-actions">
                  <button type="button" disabled={savingInstall} onClick={() => void saveInstallDate()}>
                    {savingInstall ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="quiet" disabled={savingInstall} onClick={cancelEditingInstall}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {installError && <p className="sales-line-proof-error" role="alert">{installError}</p>}
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
            {isAdmin && (
              <>
                <Link className="admin" href={`/portal/sales/${saleId}/edit`} onClick={disownHistoryEntry}>
                  <Pencil className="sales-line-icon" />Edit
                </Link>
                {/* Cancel sits before Delete deliberately: it is the answer to
                    "the customer backed out" almost every time, and it keeps
                    the record. Delete is for a row that should never have
                    existed. */}
                {sale.status === 'cancelled'
                  ? onRestore && (
                      <button className="admin" type="button" disabled={loading} onClick={() => onRestore(saleId)}>
                        <RotateCcw className="sales-line-icon" />Restore
                      </button>
                    )
                  : onRequestCancel && (
                      <button className="admin" type="button" disabled={loading} onClick={() => onRequestCancel(saleId)}>
                        <Ban className="sales-line-icon" />Cancel sale
                      </button>
                    )}
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
          <Link className="sales-line-open-full" href={`/portal/sales/${saleId}`} onClick={disownHistoryEntry}>
            Open full page <ArrowUpRight className="sales-line-icon" />
          </Link>
        </div>
      </aside>
      <ChatLightbox image={proofImage} onClose={() => setProofImage(null)} />
    </div>,
    document.body
  );
}
