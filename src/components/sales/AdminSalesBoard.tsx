'use client';

import { useMemo, useState } from 'react';
import { FIBER_COMPANIES, PAY_DELAY_DAYS, RoleDisplayNames } from '@/types';
import type { CompPlanCompanyRates, CompPlanRole, FiberOrder, FiberStatusResponse, Sale } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { expectedPayDate, expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  countInstallBuckets,
  countedSales,
  installBucketForSale,
  rollupSalesByRep,
  type InstallBucket,
  type InstallCounts,
} from '@/lib/sales/installBucket';
import { SaleDetailSheet } from './SaleDetailSheet';

// The company book, for admins and owners. One row per rep instead of one row
// per sale: on a phone, thirty-one sales is a scroll nobody reads, while four
// reps is a glance. Approval is gone, so the install pipeline is the only state
// worth colouring — green landed, amber booked, red nobody has a date yet.

interface AdminSalesBoardProps {
  /** Already scoped to the selected month by the page. */
  sales: Sale[];
  loading?: boolean;
  onDelete?: (saleId: string) => void | Promise<boolean>;
  fiber?: { data: FiberStatusResponse | null; loading: boolean; error: string | null };
  /** The viewer's own comp-plan slice. Admin/owner resolve to the Internal Rep scale. */
  payPlan?: {
    rates: CompPlanCompanyRates | null;
    payDelayDays: number;
    hasPlan: boolean;
    compRole: CompPlanRole | null;
  };
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function productSummary(sale: Sale) {
  return (sale.products || [])
    .map((product) => {
      const provider = FIBER_COMPANIES.find((item) => item.value === product.company)?.label || product.company;
      return `${product.productName} / ${provider}`;
    })
    .join(' · ');
}

const BUCKET_LABEL: Record<InstallBucket, string> = {
  installed: 'installed',
  scheduled: 'scheduled',
  attention: 'no date',
};

/** "5 installed · 2 scheduled · 1 no date" — a zero segment is left out entirely. */
function countsSummary(counts: InstallCounts): string {
  return (['installed', 'scheduled', 'attention'] as InstallBucket[])
    .filter((bucket) => counts[bucket] > 0)
    .map((bucket) => `${counts[bucket]} ${BUCKET_LABEL[bucket]}`)
    .join(' · ');
}

function installChip(sale: Sale, bucket: InstallBucket) {
  if (bucket === 'attention') return 'No install date';
  return `${bucket === 'installed' ? 'Installed' : 'Installs'} ${formatDate(sale.installDate)}`;
}

export function AdminSalesBoard({ sales, loading, onDelete, fiber, payPlan }: AdminSalesBoardProps) {
  const { user, isRole } = useAuth();
  const isAdmin = isRole('admin');
  const hasPlan = !!payPlan?.hasPlan;

  const [tab, setTab] = useState<'company' | 'pay'>('company');
  const [openRepId, setOpenRepId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // `now` is frozen per render pass so the bar, the sub-lines and the chips
  // can never straddle midnight and disagree about what "installed" means.
  const now = useMemo(() => new Date(), []);
  const fiberOrders = useMemo(() => fiber?.data?.orders ?? [], [fiber?.data?.orders]);
  const fiberBySale = useMemo<Map<string, FiberOrder>>(
    () => matchFiberOrdersToSales(sales, fiberOrders),
    [fiberOrders, sales]
  );

  const counted = useMemo(() => countedSales(sales), [sales]);
  const counts = useMemo(
    () => countInstallBuckets(sales, fiberBySale, now),
    [fiberBySale, now, sales]
  );
  const reps = useMemo(
    () => rollupSalesByRep(sales, fiberBySale, now),
    [fiberBySale, now, sales]
  );
  const monthValue = counted.reduce((sum, sale) => sum + (sale.totalValue || 0), 0);

  // My pay: the viewer's own installed work, soonest money first.
  const mySales = useMemo(
    () =>
      sales
        .filter((sale) => sale.salesRepId === user?.uid && !!sale.installDate && isPayableSale(sale))
        .sort((a, b) => new Date(b.installDate!).getTime() - new Date(a.installDate!).getTime()),
    [sales, user?.uid]
  );
  const myExpected = useMemo(
    () => mySales.reduce((sum, sale) => sum + (expectedPayForSale(sale, payPlan?.rates ?? null) ?? 0), 0),
    [mySales, payPlan?.rates]
  );

  // The rows the detail sheet arrows through: whichever list is on screen.
  const sheetSales = tab === 'pay' ? mySales : openRepId ? reps.find((r) => r.repId === openRepId)?.sales ?? [] : [];
  const selectedIndex = selectedId ? sheetSales.findIndex((sale) => sale.id === selectedId) : -1;
  const selectedSale = selectedIndex >= 0 ? sheetSales[selectedIndex] : null;
  const moveSelection = (direction: number) => {
    if (!sheetSales.length) return;
    const next = (selectedIndex + direction + sheetSales.length) % sheetSales.length;
    setSelectedId(sheetSales[next]?.id || null);
  };

  const payScaleLabel = payPlan?.compRole ? RoleDisplayNames[payPlan.compRole] : null;

  return (
    <>
      {hasPlan && (
        <nav className="sales-line-tabs" aria-label="Sales views">
          <button
            className="sales-line-tab"
            role="tab"
            type="button"
            aria-selected={tab === 'company'}
            onClick={() => { setTab('company'); setSelectedId(null); }}
          >
            Company
          </button>
          <button
            className="sales-line-tab"
            role="tab"
            type="button"
            aria-selected={tab === 'pay'}
            onClick={() => { setTab('pay'); setSelectedId(null); }}
          >
            My pay
          </button>
        </nav>
      )}

      {tab === 'company' ? (
        <section className="sales-board" aria-label="Company sales by rep">
          <div className="sales-board-summary">
            <div className="sales-board-figs">
              <div className="sales-board-fig">
                <strong className="portal-metallic-num">{counted.length}</strong>
                <span>Sales</span>
              </div>
              <div className="sales-board-fig">
                <strong className="portal-metallic-num">{formatMoney(monthValue)}<small> / mo</small></strong>
                <span>Value</span>
              </div>
            </div>

            {/* Weighted by count, so the bar IS the pipeline rather than a legend. */}
            <div className="sales-board-strip" role="img" aria-label={countsSummary(counts) || 'No sales this month'}>
              {counts.installed > 0 && <i className="installed" style={{ flexGrow: counts.installed }} />}
              {counts.scheduled > 0 && <i className="scheduled" style={{ flexGrow: counts.scheduled }} />}
              {counts.attention > 0 && <i className="attention" style={{ flexGrow: counts.attention }} />}
              {counted.length === 0 && <i className="empty" style={{ flexGrow: 1 }} />}
            </div>

            <p className="sales-board-key">
              <span className="installed">{counts.installed} installed</span>
              <span className="scheduled">{counts.scheduled} scheduled</span>
              <span className="attention">{counts.attention} need a date</span>
            </p>
          </div>

          <div className="sales-board-reps-head">
            <span>Rep</span>
            <span>Value / mo</span>
          </div>

          {reps.length === 0 && !loading && (
            <p className="sales-line-ledger-empty">No sales logged this month.</p>
          )}

          {reps.map((rep) => {
            const open = openRepId === rep.repId;
            return (
              <div key={rep.repId}>
                <button
                  className={`sales-board-rep${open ? ' open' : ''}`}
                  type="button"
                  aria-expanded={open}
                  onClick={() => { setOpenRepId(open ? null : rep.repId); setSelectedId(null); }}
                >
                  <span className="sales-board-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <span className="sales-board-rep-name">{rep.repName}</span>
                  <span className="sales-board-rep-value">{formatMoney(rep.value)}</span>
                  <span className="sales-board-rep-sub">{countsSummary(rep.counts)}</span>
                  <span className="sales-board-rep-count">{rep.count} sale{rep.count === 1 ? '' : 's'}</span>
                </button>

                {open && (
                  <div className="sales-board-sales">
                    {rep.sales.map((sale) => {
                      const bucket = installBucketForSale(sale, fiberBySale.get(sale.id || ''), now);
                      return (
                        <div
                          className={`sales-board-sale ${bucket}`}
                          key={sale.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedId(sale.id || null)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedId(sale.id || null);
                            }
                          }}
                        >
                          <span className="sales-board-sale-cust">
                            {sale.customerName || sale.customerAddress || 'Customer pending'}
                          </span>
                          <span className="sales-board-sale-val">
                            {formatMoney(sale.totalValue || 0)}<small>/mo</small>
                          </span>
                          <span className="sales-board-sale-prod">{productSummary(sale) || '—'}</span>
                          <span className={`sales-board-chip ${bucket}`}>{installChip(sale, bucket)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <section className="sales-board" aria-label="My expected pay">
          <div className="sales-board-summary">
            {payScaleLabel && <span className="sales-board-scale">Pay scale · {payScaleLabel}</span>}
            <div className="sales-board-figs">
              <div className="sales-board-fig">
                <strong className="portal-metallic-num">{formatMoney(myExpected)}</strong>
                <span>Expected this month</span>
              </div>
            </div>
            <p className="sales-board-note">
              Paid about {payPlan?.payDelayDays ?? PAY_DELAY_DAYS} days after each install.
            </p>
          </div>

          {mySales.length === 0 ? (
            <p className="sales-line-ledger-empty">
              Nothing installed yet. Pay shows up here once one of your sales has an install date.
            </p>
          ) : (
            mySales.map((sale) => {
              const expected = expectedPayForSale(sale, payPlan?.rates ?? null);
              const due = expectedPayDate(sale, payPlan?.payDelayDays ?? PAY_DELAY_DAYS);
              return (
                <div
                  className="sales-board-payrow"
                  key={sale.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(sale.id || null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(sale.id || null);
                    }
                  }}
                >
                  <span className="sales-board-sale-cust">
                    {sale.customerName || sale.customerAddress || 'Customer pending'}
                  </span>
                  {/* A rate of 0 means the comp plan has no contracted rate for
                      that product yet — say so rather than promising $0. */}
                  <span className={`sales-board-amt${expected ? '' : ' pending'}`}>
                    {expected ? formatMoney(expected) : 'Rate pending'}
                  </span>
                  <span className="sales-board-sale-prod">
                    {productSummary(sale) || '—'} · installed {formatDate(sale.installDate)}
                  </span>
                  <span className="sales-board-when">{due ? `Pays ${formatDate(due)}` : 'Pay date —'}</span>
                </div>
              );
            })
          )}
        </section>
      )}

      <SaleDetailSheet
        sale={selectedSale}
        index={selectedIndex}
        total={sheetSales.length}
        open={!!selectedSale}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        onPrev={() => moveSelection(-1)}
        onNext={() => moveSelection(1)}
        isAdmin={isAdmin}
        loading={loading}
        onRequestDelete={(id) => setDeletingId(id)}
      />

      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sale</DialogTitle>
            <DialogDescription>Are you sure you want to delete this sale? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={() => {
                const id = deletingId;
                setDeletingId(null);
                setSelectedId(null);
                if (id) void onDelete?.(id);
              }}
            >
              Delete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
