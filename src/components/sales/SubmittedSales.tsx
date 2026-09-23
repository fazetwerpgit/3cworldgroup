'use client';

import Link from 'next/link';
import { FIBER_COMPANIES, SaleStatusConfig } from '@/types';
import type { Sale } from '@/types';
import x from '@/components/portal/rep/rep-sales.module.css';

// What the reps actually typed in.
//
// This exists because of what the merged board CANNOT answer. A red "not in
// the portal" row is the carrier saying an install happened that nobody wrote
// down — and the only way to know whether that accusation is fair is to look
// at the raw submissions and see whether anyone logged that address. So these
// rows are deliberately DUMB: no carrier data, no join, no inference, no
// derived state. The merged board is the opinion; this is the evidence, and it
// is only worth anything as long as nothing here is inferred.
//
// It used to be a top-level tab listing every rep's submissions in one flat
// column. Jacob, 2026-09-03: that was cluttered, and the list belongs under
// each rep in Install status — beside the carrier's account of the same rep,
// which is the comparison it was always being used for.
//
// The address leads every row for the same reason as before: reading down the
// column looking for one street is the entire job these rows do.

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

/**
 * The raw submitted rows for ONE rep. Rendering only — whoever calls this has
 * already decided which sales belong here and in what order.
 */
export function SubmittedRows({ sales }: { sales: Sale[] }) {
  if (sales.length === 0) {
    return <p className={x.empty}>Nothing logged in the portal.</p>;
  }

  return (
    <div data-part="sub-list">
      {sales.map((sale) => {
        const sold = formatDate(sale.saleDate);
        const install = formatDate(sale.installDate);
        // Anything but approved is said out loud. A rejected or cancelled
        // submission still proves somebody logged the address, which is
        // exactly the question these rows are here to answer.
        const flagged = sale.status !== 'approved';
        return (
          <Link className={x.subRow} data-part="sub-row" key={sale.id} href={`/portal/sales/${sale.id}`}>
            <span className={x.subAddr} data-part="sub-addr">{sale.customerAddress || 'No address given'}</span>
            <span className={x.bVal}>
              <b>{formatMoney(sale.totalValue || 0)}</b>/mo
            </span>
            <span className={x.subWho}>
              {[sale.customerName || 'No customer name', planSummary(sale)]
                .filter(Boolean).join(' · ')}
            </span>
            <span className={x.subWhen}>
              {[sold ? `Sold ${sold}` : 'No sale date', install ? `Installs ${install}` : 'No install date']
                .join(' · ')}
              {flagged && (
                <>
                  {' '}
                  <span className={`${x.tag} ${x.tagWarn}`}>{SaleStatusConfig[sale.status].name}</span>
                </>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
