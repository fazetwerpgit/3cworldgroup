import type { Sale } from '@/types';
import type { FiberOrder, FiberOrderStatus } from '@/types/fiberOrder';
import type { RowStatus } from '@/lib/dashboard/repSummary';
import { isStandingBreakage } from '@/lib/sales/installBucket';
import x from '@/components/portal/rep/rep-sales.module.css';
import { FiberStatusPill } from './InstallStatusSection';

export const STATUS_CLASS: Record<RowStatus, string> = {
  installed: x.st_installed,
  scheduled: x.st_scheduled,
  'needs-date': x.st_needsdate,
  missed: x.st_missed,
  cancelled: x.st_cancelled,
};

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The dashboard's status line, so a sale reads the same on both pages. */
export function statusLine(status: RowStatus, installDate: Date | string | null | undefined) {
  switch (status) {
    case 'installed':
      return installDate ? `Installed ${formatDate(installDate)}` : 'Installed';
    case 'scheduled':
      return installDate ? `Installs ${formatDate(installDate)}` : 'Scheduled';
    case 'needs-date':
      return 'Needs install date';
    case 'missed':
      return 'Missed install · reschedule';
    case 'cancelled':
      return 'Cancelled';
  }
}

/** Carrier statuses the status line already says; the pill only shows when it adds something. */
const LINE_SAYS: Record<FiberOrderStatus, RowStatus[]> = {
  active: ['installed'],
  pending_install: ['scheduled', 'needs-date'],
  pre_sale: ['scheduled', 'needs-date'],
  cancelled: ['cancelled'],
  churned: [],
  breakage: ['missed'],
};

/**
 * The carrier's word on a sale, only when the status line doesn't already say
 * it. A breakage the sale was rescheduled past is history, not a flag.
 */
export function carrierAddsInfo(sale: Pick<Sale, 'installDate'>, order: FiberOrder | null | undefined, status: RowStatus) {
  if (!order) return false;
  if (LINE_SAYS[order.status].includes(status)) return false;
  return !(order.status === 'breakage' && !isStandingBreakage(sale, order));
}

/** A sale's status line, plus the carrier pill when it adds something. */
export function InstallStatusLine({
  sale,
  order,
  status,
}: {
  sale: Pick<Sale, 'installDate'>;
  order: FiberOrder | null | undefined;
  status: RowStatus;
}) {
  return (
    <>
      <span className={`${x.status} ${STATUS_CLASS[status]}`}>
        <span className={x.dot} aria-hidden="true" />
        {statusLine(status, sale.installDate)}
      </span>
      {order && carrierAddsInfo(sale, order, status) && (
        <span className={x.carrierSays}>
          <FiberStatusPill status={order.status} />
        </span>
      )}
    </>
  );
}
