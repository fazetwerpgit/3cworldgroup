import type { FiberOrder } from '@/types/fiberOrder';

// The carrier's report mailbox re-sends every earlier daily report alongside
// the new one (9/23: 7 files in 34s, 9/24: 8 in 46s, oldest first). Loading an
// older file over a newer one moved install dates back and forth and pushed
// reps "Install date changed" twice per sale. An older report is skipped.

type Dated = Pick<FiberOrder, 'orderDate' | 'activationDate' | 'cancellationDate' | 'deactivationDate'>;

/** The latest activity date in the report (YYYY-MM-DD), ignoring anything after `today`. */
export function reportAsOf(orders: readonly Dated[], today: string): string | null {
  let latest: string | null = null;
  for (const order of orders) {
    for (const day of [order.orderDate, order.activationDate, order.cancellationDate, order.deactivationDate]) {
      if (day && day <= today && (!latest || day > latest)) latest = day;
    }
  }
  return latest;
}

export interface ReportStamp {
  /** The email's own sent time (ISO), when the mail had one. */
  sentAt: string | null;
  asOf: string | null;
}

/** True when this report is older than the one already loaded, by either measure. */
export function isOlderReport(incoming: ReportStamp, loaded: Partial<ReportStamp> | undefined): boolean {
  if (!loaded) return false;
  if (incoming.sentAt && loaded.sentAt && incoming.sentAt < loaded.sentAt) return true;
  if (incoming.asOf && loaded.asOf && incoming.asOf < loaded.asOf) return true;
  return false;
}

/** An RFC 2822 mail Date header as ISO, or null. */
export function mailSentAt(header: unknown): string | null {
  if (typeof header !== 'string' || !header.trim()) return null;
  const time = Date.parse(header);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
