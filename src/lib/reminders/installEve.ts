import type { FiberOrder, Sale } from '@/types';
import { planLabel } from '@/lib/dashboard/repSummary';
import { customerLabel, unshout } from '@/lib/fiberReport/carrierNotice';
import { carrierMark, planWithoutCarrier } from '@/lib/sales/carrierMark';
import { countedSales, isStandingBreakage } from '@/lib/sales/installBucket';
import { installDayKey } from '@/lib/sales/saleDate';
import { addDays, chicagoDayKey, chicagoHour, type DayKey } from '@/lib/weeklyInstalls/week';

// The evening-before install reminder. "Customer not home" is the most common
// reason an install breaks, so the night before, the rep gets one push listing
// tomorrow's installs, and Home shows a row per install with a one-tap text to
// the customer from the rep's own phone (an sms: link; no SMS service).
//
// Pure: the cron (run.ts) and Home both pick tomorrow's installs here, so the
// push and the rows can never disagree. `sales` carry the carrier's install
// dates already (applyCarrierInstallDates), as everywhere else on the dashboard.

/** The cron acts at 6 PM Chicago (see isReminderHour). */
export const REMINDER_HOUR = 18;
/** Home shows tomorrow's installs from noon Chicago the day before. */
export const ROWS_FROM_HOUR = 12;
/** Where the push lands: Home, scrolled to Today. */
export const REMINDER_LINK = '/portal/dashboard?installs=tomorrow';

export interface EveInstall {
  saleId: string;
  /** The install day, YYYY-MM-DD in Chicago. */
  day: DayKey;
  /** "Jane D.", else the street, else "A customer". */
  customer: string;
  /** "Jane" for the text, null when the sale has no name. */
  customerFirst: string | null;
  /** The plan without its carrier name ("1 Gig"); '' when the sale has no plan. */
  planShort: string;
  /** "T-Fiber", '' when the carrier is unknown. */
  carrier: string;
  /** +1XXXXXXXXXX, or null when the sale has no usable number. */
  phone: string | null;
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

/** Home shows the rows from noon on; before that "tomorrow" is a day off. */
export function showsInstallRows(now: Date): boolean {
  return chicagoHour(now) >= ROWS_FROM_HOUR;
}

/**
 * A US number as +1XXXXXXXXXX for an sms: link, or null. Reps type numbers
 * every which way ("(214) 555-0101", "1-214-555-0101"); anything that is not
 * 10 digits (or 11 with a leading 1) can't be texted reliably.
 */
export function smsPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function toInstall(sale: Sale, order: FiberOrder | undefined, day: DayKey): EveInstall {
  const company = sale.products?.[0]?.company;
  const hasPlan = !!(sale.products?.length || sale.productSold);
  const name = unshout(sale.customerName?.trim() || order?.customerName?.trim() || '');
  return {
    saleId: sale.id || '',
    day,
    customer: customerLabel(
      { customerName: order?.customerName ?? null, address: order?.address ?? '' },
      { customerName: sale.customerName?.trim() || null, customerAddress: sale.customerAddress || null }
    ),
    customerFirst: name.split(/\s+/)[0] || null,
    planShort: hasPlan ? planWithoutCarrier(planLabel(sale), company) : '',
    carrier: carrierMark(company),
    phone: smsPhone(sale.customerPhone),
  };
}

/**
 * The installs on `day`: a live sale (not cancelled or rejected, the carrier
 * has not cancelled or disconnected it) whose install date is that Chicago
 * day, that the carrier has not already activated, and that is not sitting on
 * a missed install. Phone or not: the push counts them all; only the ones
 * with a phone get a Text row.
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

/** The push: one install by name, several by count. */
export function reminderPush(installs: readonly EveInstall[]): { title: string; message: string } {
  if (installs.length === 1) {
    const [install] = installs;
    // "Jane D." already ends in a period; don't print two.
    const who = [install.customer, install.planShort].filter(Boolean).join(' · ').replace(/\.$/, '');
    return { title: 'Install tomorrow', message: `${who}. Text a reminder so someone is home.` };
  }
  return { title: `${installs.length} installs tomorrow`, message: 'Text reminders so someone is home.' };
}

/** The text the rep sends; Messages opens with it filled in, so they can edit it. */
export function reminderText(input: { customerFirst: string | null; repFirst: string | null; carrier: string }): string {
  const hi = input.customerFirst ? `Hi ${input.customerFirst}` : 'Hi';
  const from = input.repFirst ? `, it's ${input.repFirst}.` : '.';
  const install = input.carrier ? `your ${input.carrier} install` : 'your install';
  return (
    `${hi}${from} Reminder: ${install} is tomorrow. ` +
    'Someone 18+ needs to be home to let the tech in. Text me if anything changes.'
  );
}

/** `sms:+1XXXXXXXXXX?&body=…`: the one form both iOS and Android Messages read. */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

/** The localStorage key that marks one install texted (see texted.ts). */
export function textedKey(install: Pick<EveInstall, 'saleId' | 'day'>): string {
  return `${install.saleId}:${install.day}`;
}
