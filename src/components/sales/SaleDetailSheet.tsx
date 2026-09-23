'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Pencil,
  Phone,
  RotateCcw,
  Trash2,
  Ban,
  X,
} from 'lucide-react';
import { Sale, FIBER_COMPANIES, SaleStatusConfig, type FiberOrder } from '@/types';
import { auth } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/hooks/useSales';
import { isStandingBreakage } from '@/lib/sales/installBucket';
import { firstRescheduleDay, missedInstallDay, rescheduleDayError } from '@/lib/sales/rescheduleDay';
import { dateToSaleDateInput, installDayKey, parseInstallDateInput, todaySaleDateInput } from '@/lib/sales/saleDate';
import { saleProofPaths } from '@/lib/sales/proofPaths';
import { saveInstallDate as saveOwnInstallDate } from '@/lib/sales/saveInstallDate';
import { ChatLightbox } from '@/components/chat/ChatLightbox';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { FiberStatusPill } from './InstallStatusSection';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';

interface SaleDetailSheetProps {
  sale: Sale | null;
  total: number;
  /** The sale's place in the list behind the sheet ("4 of 10"); omitted or -1, not shown. */
  index?: number;
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
  /** The T-Fiber estimated payout window ("Sep 21–25"), when the sale has installed. */
  payout?: string | null;
  /**
   * The carrier's current row for this sale, when the report has one. A
   * standing missed install can only move to a day after the carrier's miss,
   * as on Home's reschedule sheet; anything earlier would still count as missed.
   */
  fiberOrder?: FiberOrder | null;
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

/** Short carrier wordmarks, text placeholders until the real logo files exist. */
const CARRIER_MARK: Record<string, string> = {
  tfiber: 'T-Fiber',
  att: 'AT&T',
  frontier: 'Frontier',
  xfinity: 'Xfinity',
};

/** The carrier's wordmark text for a product company id ("tfiber" → "T-Fiber"). */
export function carrierMark(company: string) {
  return CARRIER_MARK[company] || FIBER_COMPANIES.find((item) => item.value === company)?.label || company;
}

// Plan names carry the carrier ("TFiber 1 Gig"); beside the carrier mark that
// reads twice, so the mark keeps the carrier and the plan keeps the rest.
const CARRIER_PREFIX = /^(T-?Fiber|AT&T(?: Internet| Fiber)?|Frontier(?: Fiber)?|Xfinity)\s+/i;

/** "TFiber 1 Gig" → "1 Gig", for a plan shown next to its carrier mark. */
export function planWithoutCarrier(name: string) {
  const rest = name.replace(CARRIER_PREFIX, '');
  return rest || name;
}

export function SaleDetailSheet({
  sale,
  total,
  index = -1,
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
  payout = null,
  fiberOrder = null,
}: SaleDetailSheetProps) {
  /** Index of the screenshot being fetched, or null when none is. */
  const [proofLoading, setProofLoading] = useState<number | null>(null);
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

  if (!sale || !open || typeof document === 'undefined') return null;

  const saleId = sale.id || '';
  const storedInstallDate = installDateAsDate(sale.installDate);
  const shownInstallDate = installSaved && installSaved.saleId === saleId
    ? installSaved.date
    : storedInstallDate;
  // The owning rep, or an admin. A cancelled or rejected sale has no install to move.
  const ownSale = !!user?.uid && sale.salesRepId === user.uid;
  const canEditInstallDate =
    sale.status !== 'cancelled' && sale.status !== 'rejected' && (isAdmin || ownSale);
  // A missed install: the new day has to land after the one that broke.
  const missed = isStandingBreakage({ installDate: shownInstallDate ?? undefined }, fiberOrder);
  const brokeDay = missed ? missedInstallDay(fiberOrder?.estInstallDate, shownInstallDate) : '';
  const firstDay = missed ? firstRescheduleDay(brokeDay, installDayKey(sale.saleDate) ?? '') : '';

  const startEditingInstall = () => {
    setInstallError(null);
    // A missed install starts empty: the old date is the one that broke.
    if (missed) setInstallDraft('');
    else setInstallDraft(shownInstallDate ? dateToSaleDateInput(shownInstallDate) : todaySaleDateInput());
  };

  const cancelEditingInstall = () => {
    setInstallDraft(null);
    setInstallError(null);
  };

  const saveInstallDate = async () => {
    if (installDraft === null || savingInstall) return;
    const missedError = missed ? rescheduleDayError(installDraft, brokeDay) : null;
    if (missedError) {
      setInstallError(missedError);
      return;
    }
    const parsed = parseInstallDateInput(installDraft);
    if (!parsed.ok) {
      setInstallError(INSTALL_DATE_ERROR);
      return;
    }
    setSavingInstall(true);
    setInstallError(null);
    // Their own sale goes through the install-date-only route (a rep's one
    // edit); an admin fixing someone else's sale keeps the full edit.
    let failure: string | null = null;
    if (ownSale) {
      const result = await saveOwnInstallDate(saleId, installDraft);
      if (!result.ok) failure = result.error;
    } else if (!(await updateSale(saleId, { installDate: installDraft }))) {
      failure = INSTALL_DATE_ERROR;
    }
    setSavingInstall(false);
    if (failure) {
      setInstallError(failure);
      return;
    }
    setInstallSaved({ saleId, date: parsed.date });
    setInstallDraft(null);
    onSaleUpdated?.();
  };

  const proofPaths = saleProofPaths(sale);

  const openScreenshot = async (index: number) => {
    const path = proofPaths[index];
    if (!path) return;
    setProofLoading(index);
    setProofError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(
        `/api/portal/forms/attachment?path=${encodeURIComponent(path)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error('Could not load the screenshot. Try again.');
      setProofImage({
        url: data.url,
        alt: proofPaths.length > 1 ? `Sale proof screenshot ${index + 1}` : 'Sale proof screenshot',
      });
    } catch {
      setProofError('Could not load the screenshot. Try again.');
    } finally {
      setProofLoading(null);
    }
  };

  // Portaled to <body> (BodyLayer): on iPhones <main> is the scroller, and iOS
  // WebKit breaks position:fixed inside it — the sheet gets clipped to main's
  // box and painted UNDER the fixed bars, hiding the close X with no way out.
  // BodyLayer's display:contents wrapper re-supplies the D tokens.
  return (
    <BodyLayer>
      <button
        type="button"
        className={s.backdrop}
        aria-label="Close sale detail"
        tabIndex={-1}
        onClick={() => onOpenChange(false)}
      />
      <aside className={`${s.sheet} ${x.detail}`} role="dialog" aria-modal="true" aria-label="Sale detail">
        <div className={s.sheetHandle} aria-hidden="true" />
        <div className={`${s.sheetHead} ${x.dHead}`}>
          <div className={x.sheetHeadText}>
            <h2 className={x.sheetName}>{sale.customerName || sale.customerAddress || 'Customer pending'}</h2>
            <p className={x.dStatus}>
              <span className={`${x.dTag} ${sale.status === 'rejected' ? x.tagWarn : ''}`}>{SaleStatusConfig[sale.status]?.name ?? sale.status}</span>
              <span className={x.dAge}>
                Sold {formatDate(sale.saleDate)}
                {index >= 0 && total > 1 ? ` · ${index + 1} of ${total}` : ''}
              </span>
            </p>
          </div>
          <button className={s.iconBtn} type="button" onClick={() => onOpenChange(false)} aria-label="Close detail">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={`${s.sheetBody} ${x.dBody}`}>
          {sale.status === 'cancelled' && (
            <p className={x.dCancelled}>
              Cancelled {sale.cancelledAt ? formatDate(sale.cancelledAt) : ''}
              {sale.cancellerName ? ` by ${sale.cancellerName}` : ''}
              {sale.cancelReason ? ` — ${sale.cancelReason}` : '. No reason given.'}
            </p>
          )}

          {/* The money sits in a well at the top: est. pay, then the value and points behind it. */}
          <div className={x.dMoney}>
            <div>
              <span className={s.kicker}>Est. pay</span>
              <span className={x.dMoneyNum}>
                {typeof sale.commission === 'number' ? <><span className={x.amtEst}>est.</span>{formatMoney(sale.commission)}</> : '—'}
              </span>
            </div>
            <dl className={x.dSummary}>
              <div><dt>Monthly value</dt><dd>{formatMoney(sale.totalValue || 0)}</dd></div>
              <div><dt>Points</dt><dd>{sale.totalPoints || 0}</dd></div>
            </dl>
          </div>

          <section className={x.dBlock} aria-labelledby="sd-dates">
            <h3 id="sd-dates" className={`${s.kicker} ${x.dHeading}`}>Dates</h3>
            <div className={x.dKv}>
              <span>Sold</span>
              <b>{formatDate(sale.saleDate)}</b>
            </div>
            <div className={x.dKv}>
              <span>Install</span>
              <span className={x.dKvEnd}>
                <b>{formatDate(shownInstallDate)}</b>
                {canEditInstallDate && installDraft === null && (
                  <button
                    className={`${x.actBtn} ${x.dChange}`}
                    type="button"
                    aria-label="Change install date"
                    onClick={startEditingInstall}
                  >
                    Change
                  </button>
                )}
              </span>
            </div>
            {payout && <p className={x.dSub}>Est. payout <b>{payout}</b></p>}
            {installDraft !== null && (
              <div className={x.dEditor}>
                <label className={x.dEditorLabel} htmlFor="sale-install-date">
                  Install date
                </label>
                <input
                  id="sale-install-date"
                  className={x.input}
                  type="date"
                  value={installDraft}
                  min={firstDay || undefined}
                  disabled={savingInstall}
                  onChange={(event) => setInstallDraft(event.target.value)}
                />
                {missed && (
                  <p className={x.dEditorHint}>The carrier marked the last install as missed. Pick a day after it.</p>
                )}
                <div className={x.dEditorActions}>
                  <button type="button" className={`${x.actBtn} ${x.actPrimary}`} disabled={savingInstall} onClick={() => void saveInstallDate()}>
                    {savingInstall ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className={x.actBtn} disabled={savingInstall} onClick={cancelEditingInstall}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {installError && <p className={x.inlineError} role="alert">{installError}</p>}
          </section>

          <section className={x.dBlock} aria-labelledby="sd-plans">
            <h3 id="sd-plans" className={`${s.kicker} ${x.dHeading}`}>Plans sold</h3>
            <div>
              {sale.products?.map((product, productIndex) => (
                <div className={x.dPlan} key={`${product.productId}-${productIndex}`}>
                  <span className={x.carrierMark}>{carrierMark(product.company)}</span>
                  <strong>{planWithoutCarrier(product.productName)}</strong>
                  <b>{formatMoney(product.totalPrice || product.unitPrice)}/mo</b>
                  <em>{product.points} pts</em>
                </div>
              ))}
            </div>
            {fiberOrder ? (
              <p className={x.dCarrier}>
                <span>Carrier report</span>
                <FiberStatusPill status={fiberOrder.status} />
              </p>
            ) : null}
          </section>

          <section className={x.dBlock} aria-label="Customer">
            <h3 className={`${s.kicker} ${x.dHeading}`}>Customer</h3>
            <div className={x.dKv}>
              <span>Phone</span>
              {sale.customerPhone ? (
                <a className={x.dPhone} href={`tel:${sale.customerPhone.replace(/[^0-9+]/g, '')}`}>
                  <Phone size={16} aria-hidden="true" />
                  {sale.customerPhone}
                </a>
              ) : (
                <span className={x.dNone}>No phone provided</span>
              )}
            </div>
            <div className={x.dKv}>
              <span>Address</span>
              <b className={x.dAddr}>{sale.customerAddress || <span className={x.dNone}>No address provided</span>}</b>
            </div>
          </section>

          <section className={x.dBlock} aria-labelledby="sd-proof">
            <h3 id="sd-proof" className={`${s.kicker} ${x.dHeading}`}>Order / proof</h3>
            <div className={x.proofList} data-part="proof">
              {sale.orderNumberOrBtn && (
                <span className={x.dLine}>
                  <FileText size={16} aria-hidden="true" />
                  {sale.orderNumberOrBtn}
                </span>
              )}
              {proofPaths.length > 0 ? (
                proofPaths.map((path, proofIndex) => (
                  <button
                    key={path}
                    type="button"
                    className={x.proofBtn}
                    onClick={() => void openScreenshot(proofIndex)}
                    disabled={proofLoading !== null}
                  >
                    <ImageIcon size={18} aria-hidden="true" />
                    <span>
                      {proofLoading === proofIndex
                        ? 'Opening proof...'
                        : proofPaths.length > 1
                          ? `Screenshot ${proofIndex + 1}`
                          : 'View proof screenshot'}
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                ))
              ) : !sale.orderNumberOrBtn ? (
                <span className={x.inlineNote}>No order number or proof attached</span>
              ) : null}
            </div>
            {proofError && <p className={x.inlineError}>{proofError}</p>}
          </section>

          <section className={x.dBlock} aria-labelledby="sd-notes">
            <h3 id="sd-notes" className={`${s.kicker} ${x.dHeading}`}>Rep notes</h3>
            <p className={x.dNotes}>{sale.notes || 'No notes added.'}</p>
          </section>

          {isAdmin && (
            <div className={x.dActions}>
              <Link className={x.actBtn} href={`/portal/sales/${saleId}/edit`} onClick={disownHistoryEntry}>
                <Pencil size={16} aria-hidden="true" />Edit
              </Link>
              {/* Cancel sits before Delete deliberately: it is the answer to
                  "the customer backed out" almost every time, and it keeps
                  the record. Delete is for a row that should never have
                  existed. */}
              {sale.status === 'cancelled'
                ? onRestore && (
                    <button className={x.actBtn} type="button" disabled={loading} onClick={() => onRestore(saleId)}>
                      <RotateCcw size={16} aria-hidden="true" />Restore
                    </button>
                  )
                : onRequestCancel && (
                    <button className={x.actBtn} type="button" disabled={loading} onClick={() => onRequestCancel(saleId)}>
                      <Ban size={16} aria-hidden="true" />Cancel sale
                    </button>
                  )}
              <button className={`${x.actBtn} ${x.actDanger}`} type="button" disabled={loading} onClick={() => onRequestDelete(saleId)}>
                <Trash2 size={16} aria-hidden="true" />Delete
              </button>
            </div>
          )}

          {total > 1 && (
            <div className={x.dNav}>
              <button type="button" className={`${x.actBtn} ${x.dNavBtn}`} onClick={onPrev}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
              <button type="button" className={`${x.actBtn} ${x.dNavBtn}`} onClick={onNext}>Next<ChevronRight size={16} aria-hidden="true" /></button>
            </div>
          )}
          <div className={x.dFoot}>
            <Link className={`${s.btnSecondary} ${s.btnBlock}`} href={`/portal/sales/${saleId}`} onClick={disownHistoryEntry}>
              Open full page <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </aside>
      <ChatLightbox image={proofImage} onClose={() => setProofImage(null)} />
    </BodyLayer>
  );
}
