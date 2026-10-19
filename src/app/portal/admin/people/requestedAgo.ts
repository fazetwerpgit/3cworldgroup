import { chicagoTodayKey } from '@/lib/sales/saleDate';

const keyToUtcDay = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000;

/**
 * "today", "yesterday", "3 days ago" for a sign-up request, counted in
 * calendar days on the company clock (America/Chicago), not rolling 24 hours.
 */
export function requestedAgo(date: Date | string | number | undefined, now: Date = new Date()): string {
  if (!date) return 'recently';
  const at = new Date(date);
  if (Number.isNaN(at.getTime())) return 'recently';
  const days = Math.round(keyToUtcDay(chicagoTodayKey(now)) - keyToUtcDay(chicagoTodayKey(at)));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
