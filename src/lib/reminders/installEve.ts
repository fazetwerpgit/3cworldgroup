import type { FiberOrder, Sale } from '@/types';
import { planLabel } from '@/lib/dashboard/repSummary';
import { customerLabel } from '@/lib/fiberReport/carrierNotice';
import { carrierMark, planWithoutCarrier } from '@/lib/sales/carrierMark';
import { countedSales, isStandingBreakage } from '@/lib/sales/installBucket';
import { installDayKey } from '@/lib/sales/saleDate';
import { addDays, chicagoDayKey, chicagoHour, type DayKey } from '@/lib/weeklyInstalls/week';

// The evening-before install reminder. "Customer not home" is the most common
// reason an install breaks, so at 6 PM the day before the rep gets one push
// naming tomorrow's installs, to make sure someone will be home. Automatic:
// nothing for the rep to open or tap.
//
// Pure. `sales` carry the carrier's install dates already
// (applyCarrierInstallDates), as everywhere else on the dashboard.

/** The cron acts at 6 PM Chicago (see isReminderHour). */
export const REMINDER_HOUR = 18;

export interface EveInstall {
  saleId: string;
  /** The install day, YYYY-MM-DD in Chicago. */
  day: DayKey;
  /** "Jane D.", else the street, else "A customer". */
  customer: string;
  /** "AT&T 500", "T-Fiber 1 Gig"; '' when the sale has neither. */
  plan: string;
}

/** The Chicago day after the one `now` falls on. */
export function tomorrowKey(now: Date): DayKey {
  return addDays(chicagoDayKey(now), 1);
}

/**
 * The Vercel cron fires at 23:00 AND 00:00 UTC every day, because 6 PM in
 * Chicago is 23:00 UTC in summer (CDT) and 00:00 UTC in winter (CST). Exactly
 * one of the two lands on 6 PM local; this is the gate that picks it.
 */
export function isReminderHour(now: Date): boolean {
  return chicagoHour(now) === REMINDER_HOUR;
}

function toInstall(sale: Sale, order: FiberOrder | undefined, day: DayKey): EveInstall {
  const company = sale.products?.[0]?.company;
  const hasPlan = !!(sale.products?.length || sale.productSold);
  return {
    saleId: sale.id || '',
    day,
    customer: customerLabel(
      { customerName: order?.customerName ?? null, address: order?.address ?? '' },
      { customerName: sale.customerName?.trim() || null, customerAddress: sale.customerAddress || null }
    ),
    plan: [carrierMark(company), hasPlan ? planWithoutCarrier(planLabel(sale), company) : ''].filter(Boolean).join(' '),
  };
}

/**
 * The installs on `day`: a live sale (not cancelled or rejected, the carrier
 * has not cancelled or disconnected it) whose install date is that Chicago
 * day, that the carrier has not already activated, and that is not sitting on
 * a missed install.
 */
export function installsOn(day: DayKey, sales: Sale[], fiberBySale: Map<string, FiberOrder>): EveInstall[] {
  return countedSales(sales, fiberBySale)
    .filter((sale) => installDayKey(sale.installDate) === day)
    .flatMap((sale) => {
      const order = fiberBySale.get(sale.id || '');
      if (order?.status === 'active' || isStandingBreakage(sale, order)) return [];
      return [toInstall(sale, order, day)];
    });
}

export function tomorrowInstalls(sales: Sale[], fiberBySale: Map<string, FiberOrder>, now: Date): EveInstall[] {
  return installsOn(tomorrowKey(now), sales, fiberBySale);
}

/**
 * The push: one install by name and plan, a few by name, more by count. It
 * opens the sale when there is one, else the Sales list.
 */
export function reminderPush(installs: readonly EveInstall[]): { title: string; message: string; link: string } {
  const ask = 'Make sure someone will be home.';
  if (installs.length === 1) {
    const [install] = installs;
    // "Jane D." already ends in a period; don't print two.
    const who = [install.customer, install.plan].filter(Boolean).join(' · ').replace(/\.$/, '');
    return { title: 'Install tomorrow', message: `${who}. ${ask}`, link: `/portal/sales/${install.saleId}` };
  }
  const names = installs.map((install) => install.customer);
  const who = (
    names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names.length - 2} more`
  ).replace(/\.$/, '');
  return { title: `${installs.length} installs tomorrow`, message: `${who}. ${ask}`, link: '/portal/sales' };
}
