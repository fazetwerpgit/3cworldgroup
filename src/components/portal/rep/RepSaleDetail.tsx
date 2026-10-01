'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Mail,
  Pencil,
  Phone,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { InstallStatusLine } from '@/components/sales/InstallStatusLine';
import { useAuth } from '@/contexts/AuthContext';
import { useCompPlan } from '@/hooks/useCompPlan';
import { useFiberStatus } from '@/hooks/useFiberStatus';
import { useSales } from '@/hooks/useSales';
import { rowStatus, type RowStatus } from '@/lib/dashboard/repSummary';
import { carrierReasonLabel } from '@/lib/fiberReport/carrierNotice';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import { expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import { formatPayoutWindow, payoutWindowForSale } from '@/lib/pay/payoutWindow';
import { auth } from '@/lib/firebase/config';
import { carrierMark, planWithoutCarrier } from '@/lib/sales/carrierMark';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { isCarrierCancelled } from '@/lib/sales/installBucket';
import { saleProofPaths } from '@/lib/sales/proofPaths';
import { FIBER_COMPANIES, SALE_TYPES, SaleStatusConfig, type Sale } from '@/types';
import { BodyLayer } from './BodyLayer';
import { useAttachmentViewer } from './ImageViewer';
import { formatDay, formatMoney, formatPrice, num } from './saleFormat';
import s from './rep.module.css';
import x from './rep-sale.module.css';

/** A legacy free-text carrier has no mark; show its name rather than nothing. */
function carrierName(company: string) {
  return carrierMark(company) || FIBER_COMPANIES.find((item) => item.value === company)?.label || company;
}

const STATUS_CHIP: Record<RowStatus, { label: string; className: string }> = {
  installed: { label: 'Installed', className: x.st_installed },
  scheduled: { label: 'Scheduled', className: x.st_scheduled },
  'needs-date': { label: 'Needs install date', className: x.st_needsdate },
  missed: { label: 'Missed install', className: x.st_missed },
  cancelled: { label: 'Cancelled', className: x.st_cancelled },
};

function longDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function SaleSkeleton() {
  return (
    <div className={x.page} aria-busy="true" aria-label="Loading sale">
      <span className={`${s.skel} ${x.skelTitle}`} />
      <span className={`${s.skel} ${x.chipSkel}`} />
      {[0, 1, 2].map((item) => (
        <section key={item} className={s.panel}>
          <div className={x.skelBody}>
            <span className={`${s.skel} ${x.skelLineShort}`} />
            {item === 0 ? <span className={`${s.skel} ${x.skelBig}`} /> : null}
            <span className={`${s.skel} ${x.skelLine}`} />
            <span className={`${s.skel} ${x.skelLine}`} />
          </div>
        </section>
      ))}
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className={x.page}>
      <section className={`${s.panel} ${x.empty}`}>
        <TriangleAlert size={28} aria-hidden="true" color="var(--c-amber)" />
        <h1>Sale not found</h1>
        <p>{message}</p>
        <Link href="/portal/sales" className={s.btnSecondary}>
          Back to sales
        </Link>
      </section>
    </div>
  );
}

function DeleteSheet({
  name,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  name: string;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(deleting);
  useEffect(() => {
    busyRef.current = deleting;
  });
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyRef.current) onCancel();
        }}
      >
        <section className={s.sheet} role="alertdialog" aria-modal="true" aria-labelledby="delete-sale-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="delete-sale-title" className={s.sheetTitle}>
              Delete this sale?
            </h2>
            <button type="button" className={s.iconBtn} aria-label="Close" disabled={deleting} onClick={onCancel}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={x.confirm}>
            <p className={x.confirmText}>
              <strong>{name}</strong> comes off the books for good. This can&apos;t be undone.
            </p>
            {error ? (
              <p className={x.confirmError} role="alert">
                {error}
              </p>
            ) : null}
            <div className={x.confirmActions}>
              <button type="button" className={x.confirmDelete} disabled={deleting} onClick={onConfirm}>
                <Trash2 size={18} aria-hidden="true" />
                {deleting ? 'Deleting…' : 'Delete sale'}
              </button>
              <button ref={cancelRef} type="button" className={`${s.btnSecondary} ${s.btnBlock}`} disabled={deleting} onClick={onCancel}>
                Keep it
              </button>
            </div>
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={x.kv}>
      <span className={x.kvLabel}>{label}</span>
      <div className={x.kvValue}>{children}</div>
    </div>
  );
}

export function RepSaleDetail() {
  const params = useParams();
  const router = useRouter();
  const { user, isRole } = useAuth();
  const { fetchSale, deleteSale, error } = useSales();
  const fiber = useFiberStatus();
  const comp = useCompPlan();
  const proofViewer = useAttachmentViewer();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const isAdmin = isRole('admin');
  const saleId = params.id as string;

  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    void fetchSale(saleId).then((data) => {
      if (cancelled) return;
      setSale(data ? { ...data, id: data.id ?? saleId } : null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [saleId, fetchSale]);

  // The same pipeline the Sales list runs: the carrier's order for this
  // address, its activation date over the typed install date, then the
  // dashboard's status. One frozen "now" keeps the status from flickering.
  const now = useMemo(() => new Date(), []);
  const orders = fiber.data?.orders;
  const view = useMemo(() => {
    if (!sale) return null;
    const matched = matchFiberOrdersToSales([sale], orders ?? []);
    const order = matched.get(sale.id || '');
    const [applied] = applyCarrierInstallDates([sale], matched);
    return { order, sale: applied, status: rowStatus(applied, order, now) };
  }, [sale, orders, now]);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    const success = await deleteSale(saleId);
    if (success) {
      router.push('/portal/sales');
      return;
    }
    setDeleting(false);
    setDeleteFailed(true);
  };

  const openScreenshot = (path: string, label: string, trigger: HTMLElement) =>
    proofViewer.open(
      async () => {
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) throw new Error(`Attachment request failed (${response.status})`);
        const data = await response.json();
        return typeof data.url === 'string' ? data.url : null;
      },
      label,
      trigger
    );

  if (!loaded) return <SaleSkeleton />;
  if (!sale || !view) {
    return <NotFound message={error || "This sale doesn't exist, or it isn't yours to see."} />;
  }

  const { order, status } = view;
  const shown = view.sale;
  const settling = fiber.loading;
  const chip = STATUS_CHIP[status];
  const name = sale.customerName || sale.customerAddress || 'Customer pending';
  const ownSale = !!user?.uid && sale.salesRepId === user.uid;
  const products = Array.isArray(sale.products) ? sale.products : [];
  const proofPaths = saleProofPaths(sale);
  const installDay = longDay(shown.installDate);

  // Exactly the Sales list's estimate: the viewer's own rates, nothing for a
  // dead sale, and never the legacy stored `commission`.
  const payable = isPayableSale(sale) && !isCarrierCancelled(order);
  const estPay = comp.hasPlan && payable ? expectedPayForSale(sale, comp.rates) : null;
  const payWindow = payoutWindowForSale(shown, status !== 'cancelled' && status !== 'missed');
  const payout = payWindow ? formatPayoutWindow(payWindow) : null;
  const missedReason = order?.status === 'breakage' ? carrierReasonLabel(order.breakageReason) : null;

  const saleTypeLabel = SALE_TYPES.find((type) => type.value === sale.saleType)?.label;

  const payCell = () => {
    if (comp.loading) return <span className={`${s.skel} ${x.skelLineShort}`} />;
    if (comp.error) {
      return (
        <>
          <span className={x.payQuiet}>Couldn&apos;t load rates</span>
          <button type="button" className={x.retryLink} onClick={comp.retry}>
            Retry
          </button>
        </>
      );
    }
    if (!comp.hasPlan) return <span className={x.payQuiet}>No pay plan yet</span>;
    if (estPay === null) return <span className={x.none}>—</span>;
    if (estPay === 0) return <span className={x.payQuiet}>Rate pending</span>;
    return (
      <span className={x.pay}>
        <span className={x.payEst}>est.</span>
        {formatMoney(estPay)}
      </span>
    );
  };

  return (
    <div className={x.page}>
      <Link href="/portal/sales" className={`${x.back} ${s.deskOnly}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to sales
      </Link>

      <header className={x.head}>
        <h1 className={x.title}>{name}</h1>
        <div className={x.headMeta}>
          {settling ? (
            <span className={`${s.skel} ${x.chipSkel}`} aria-label="Checking install status" />
          ) : (
            <span className={`${x.chip} ${chip.className}`}>{chip.label}</span>
          )}
          {(sale.status === 'pending' || sale.status === 'rejected') && (
            <span className={`${x.tag} ${sale.status === 'rejected' ? x.tagWarn : ''}`}>
              {SaleStatusConfig[sale.status].name}
            </span>
          )}
          {formatDay(sale.saleDate) ? <span className={x.soldOn}>Sold {formatDay(sale.saleDate)}</span> : null}
        </div>
      </header>

      {sale.status === 'cancelled' && (
        <p className={`${x.note} ${x.noteRed}`}>
          <Ban size={18} aria-hidden="true" />
          <span>
            <strong>Cancelled {formatDay(sale.cancelledAt) ?? ''}</strong>
            {sale.cancellerName ? ` by ${sale.cancellerName}` : ''}
            {sale.cancelReason ? ` — ${sale.cancelReason}` : '. No reason given.'}
          </span>
        </p>
      )}

      <div className={x.body}>
        <div className={x.side}>
          <section className={`${s.panel} ${x.oInstall}`} aria-labelledby="sale-install-h">
            <div className={s.panelHead}>
              <h2 id="sale-install-h" className={s.kicker}>
                Install
              </h2>
            </div>
            <div className={x.panelBody}>
              {status === 'cancelled' ? (
                <p className={`${x.installDate} ${x.none}`}>Cancelled</p>
              ) : installDay ? (
                <p className={x.installDate}>{installDay}</p>
              ) : (
                <p className={`${x.installDate} ${x.installDateNeeds}`}>Needs install date</p>
              )}
              <p className={x.installWhat}>
                {settling ? (
                  'Checking the carrier…'
                ) : (
                  <InstallStatusLine sale={shown} order={order} status={status} />
                )}
              </p>
              {missedReason ? <Row label="Carrier says">{missedReason}</Row> : null}
              {payout ? <Row label="Est. payout">{payout}</Row> : null}
              {ownSale ? <Row label="Est. pay">{payCell()}</Row> : null}
              {ownSale || payout ? (
                <p className={x.fine}>
                  Estimates before chargebacks and claims; the carrier&apos;s final report decides what pays.
                </p>
              ) : null}
            </div>
          </section>

          <section className={`${s.panel} ${x.oProof}`} aria-labelledby="sale-proof-h">
            <div className={s.panelHead}>
              <h2 id="sale-proof-h" className={s.kicker}>
                Order and proof
              </h2>
            </div>
            <div className={x.panelBody}>
              <Row label="Order / BTN">
                {sale.orderNumberOrBtn ? (
                  <span>{sale.orderNumberOrBtn}</span>
                ) : (
                  <span className={x.none}>Not provided</span>
                )}
              </Row>
              <Row label="Sold">{formatDay(sale.saleDate) ?? <span className={x.none}>Not provided</span>}</Row>
              {saleTypeLabel ? <Row label="Type">{saleTypeLabel}</Row> : null}
              {!ownSale && sale.salesRepName ? <Row label="Sold by">{sale.salesRepName}</Row> : null}
              <div className={x.proofList} data-part="proof">
                {proofPaths.length > 0 ? (
                  proofPaths.map((path, index) => {
                    const label = proofPaths.length > 1 ? `Screenshot ${index + 1}` : 'Proof screenshot';
                    return (
                      <button
                        key={path}
                        type="button"
                        className={x.proofBtn}
                        onClick={(event) => openScreenshot(path, label, event.currentTarget)}
                      >
                        <ImageIcon size={18} aria-hidden="true" />
                        <span>{proofPaths.length > 1 ? label : 'View proof screenshot'}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    );
                  })
                ) : !sale.orderNumberOrBtn ? (
                  <p className={`${x.hint} ${x.none}`}>
                    <FileText size={16} aria-hidden="true" /> No order number or proof attached
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {isAdmin && (
            <div className={`${x.actions} ${x.oActions}`}>
              <Link className={s.btnSecondary} href={`/portal/sales/${sale.id}/edit`}>
                <Pencil size={16} aria-hidden="true" />
                Edit
              </Link>
              <button type="button" className={x.danger} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </button>
            </div>
          )}
        </div>

        <div className={x.main}>
          <section className={`${s.panel} ${x.oCustomer}`} aria-labelledby="sale-customer-h">
            <div className={s.panelHead}>
              <h2 id="sale-customer-h" className={s.kicker}>
                Customer
              </h2>
            </div>
            <div className={x.panelBody}>
              <Row label="Address">
                {sale.customerAddress || <span className={x.none}>Not provided</span>}
              </Row>
              <Row label="Phone">
                {sale.customerPhone ? (
                  <a className={x.link} href={`tel:${sale.customerPhone.replace(/[^0-9+]/g, '')}`}>
                    <Phone size={16} aria-hidden="true" />
                    {sale.customerPhone}
                  </a>
                ) : (
                  <span className={x.none}>Not provided</span>
                )}
              </Row>
              <Row label="Email">
                {sale.customerEmail ? (
                  <a className={x.link} href={`mailto:${sale.customerEmail}`}>
                    <Mail size={16} aria-hidden="true" />
                    {sale.customerEmail}
                  </a>
                ) : (
                  <span className={x.none}>Not provided</span>
                )}
              </Row>
            </div>
          </section>

          <section className={`${s.panel} ${x.oPlan}`} aria-labelledby="sale-plan-h">
            <div className={s.panelHead}>
              <h2 id="sale-plan-h" className={s.kicker}>
                Plan
              </h2>
            </div>
            <div className={x.panelBody}>
              {products.length > 0 ? (
                products.map((product, index) => {
                  const carrier = carrierName(product.company);
                  return (
                    <div className={x.plan} key={`${product.productId}-${index}`}>
                      {carrier ? <span className={x.carrier}>{carrier}</span> : <span />}
                      <span className={x.planName}>
                        {planWithoutCarrier(product.productName || product.productId || 'Plan', product.company)}
                      </span>
                      <span className={x.planPrice}>
                        {formatPrice(num(product.totalPrice) || num(product.unitPrice))}/mo
                      </span>
                      <span className={x.planPts}>{num(product.points)} pts</span>
                    </div>
                  );
                })
              ) : (
                <p className={`${x.hint} ${x.none}`}>{sale.productSold || 'Plan not set'}</p>
              )}
              <div className={x.totals}>
                <span>
                  Monthly value <b>{formatMoney(sale.totalValue)}</b>
                </span>
                <span>
                  Points <b>{num(sale.totalPoints)}</b>
                </span>
              </div>
            </div>
          </section>

          <section className={`${s.panel} ${x.oNotes}`} aria-labelledby="sale-notes-h">
            <div className={s.panelHead}>
              <h2 id="sale-notes-h" className={s.kicker}>
                Notes
              </h2>
            </div>
            <div className={x.panelBody}>
              <p className={`${x.notes} ${sale.notes ? '' : x.notesNone}`}>{sale.notes || 'No notes added.'}</p>
            </div>
          </section>

          {(sale.status === 'approved' || sale.status === 'rejected') && sale.approvedBy && (
            <p className={`${x.note} ${sale.status === 'approved' ? x.noteLime : x.noteRed} ${x.oNotes}`}>
              {sale.status === 'approved' ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
              <span>
                <strong>{sale.status === 'approved' ? 'Approved' : 'Rejected'}</strong> by{' '}
                {sale.approverName || sale.approvedBy}
                {formatDay(sale.approvedAt) ? ` on ${formatDay(sale.approvedAt)}` : ''}
                {sale.rejectionReason ? `. Reason: ${sale.rejectionReason}` : ''}
              </span>
            </p>
          )}
        </div>
      </div>

      {proofViewer.viewer}
      {confirmDelete ? (
        <DeleteSheet
          name={name}
          deleting={deleting}
          error={deleteFailed ? error || 'Could not delete the sale. Try again.' : null}
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteFailed(false);
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </div>
  );
}
