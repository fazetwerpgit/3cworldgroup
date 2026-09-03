'use client';

import { FIBER_COMPANIES, SaleStatusConfig } from '@/types';
import type { Sale } from '@/types';

// What the reps actually typed in. Owners only.
//
// This exists because of what the merged board CANNOT answer. A red "not in
// the portal" row is the carrier saying an install happened that nobody wrote
// down — and the only way to know whether that accusation is fair is to look
// at the raw submissions and see whether anyone logged that address. So this
// list is deliberately DUMB: no carrier data, no join, no inference, no
// derived state. The merged board is the opinion; this is the evidence, and
// it is only worth anything as long as nothing here is inferred.
//
// The address leads every row for the same reason: reading down the column
// looking for one street is the entire job this list does.

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value as Date | string);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function planSummary(sale: Sale) {
  return (sale.products || [])
    .map((product) => {
      const provider = FIBER_COMPANIES.find((item) => item.value === product.company)?.label || product.company;
      return `${product.productName} / ${provider}`;
    })
    .join(' · ');
}

export function SubmittedSales({
  sales,
  query,
  onQueryChange,
  onSelect,
  monthLabel,
  olderCount,
  newerCount,
}: {
  /** Already filtered and sorted by the board — this component renders, it does not decide. */
  sales: Sale[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (saleId: string | null) => void;
  monthLabel: string;
  olderCount: number;
  newerCount: number;
}) {
  const hidden = [
    olderCount ? `+${olderCount} older` : null,
    newerCount ? `+${newerCount} newer` : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <label className="sales-board-search">
        <span className="sr-only">Search submitted sales by customer or address</span>
        <input
          type="search"
          value={query}
          placeholder="Find an address or customer"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>

      <p className="sales-board-scope">
        {sales.length} submitted in {monthLabel}
        {hidden ? ` · ${hidden} outside this month` : ''}
        {query ? ' · matching your search' : ''}
      </p>

      <div className="sales-board-reps-head">
        <span>Address</span>
        <span>Value / mo</span>
      </div>

      {sales.length === 0 ? (
        <p className="sales-line-ledger-empty">
          {query ? 'Nothing submitted matches that.' : 'Nothing was submitted in this month.'}
        </p>
      ) : (
        sales.map((sale) => {
          const sold = formatDate(sale.saleDate);
          const install = formatDate(sale.installDate);
          // Anything but approved is said out loud. A rejected or cancelled
          // submission still proves somebody logged the address, which is
          // exactly the question this list is here to answer.
          const flagged = sale.status !== 'approved';
          return (
            <div
              className="sales-board-sub-row"
              key={sale.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(sale.id || null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(sale.id || null);
                }
              }}
            >
              <span className="sales-board-sub-addr">{sale.customerAddress || 'No address given'}</span>
              <span className="sales-board-sale-val">
                {formatMoney(sale.totalValue || 0)}<small>/mo</small>
              </span>
              <span className="sales-board-sale-prod">
                {[sale.customerName || 'No customer name', sale.salesRepName || 'Unassigned', planSummary(sale)]
                  .filter(Boolean).join(' · ')}
              </span>
              <span className="sales-board-when">
                {[sold ? `Sold ${sold}` : 'No sale date', install ? `Installs ${install}` : 'No install date']
                  .join(' · ')}
              </span>
              {flagged && (
                <span className="sales-board-sale-note warn">{SaleStatusConfig[sale.status].name}</span>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
