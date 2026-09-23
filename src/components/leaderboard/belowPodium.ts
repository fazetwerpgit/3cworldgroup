import { useEffect, useState } from 'react';
import type { RecentSale, UnrankedRep } from '@/lib/leaderboard/team';
import { relativeSaleTime, tapeRepName } from '@/lib/sales/companyTape';
import { installDayKey } from '@/lib/sales/saleDate';
import { leaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from './LeaderboardTable';

/* What sits under the podium on both boards (phone and the legacy desktop):
 * the team at 0 after the ranked reps, the viewer's one-line spot, and the
 * newest sales. The data comes from the leaderboard API's ?include=team. */

/** The team at 0 as board rows: tied at 0, by name, numbered on from the last
 *  ranked rep and never inside the podium (rank 4 at the earliest). */
export function zeroEntries(ranked: LeaderboardEntry[], unranked: UnrankedRep[]): LeaderboardEntry[] {
  const lastRank = ranked.reduce((max, entry) => Math.max(max, entry.rank), 0);
  const start = Math.max(lastRank, 3) + 1;
  return unranked.map((rep, index) => ({
    rank: start + index,
    salesRepId: rep.salesRepId,
    salesRepName: rep.salesRepName,
    totalSales: 0,
    totalPoints: 0,
  }));
}

function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${n % 10 > 3 ? 'th' : suffix}`;
}

/**
 * One plain line for a viewer off the podium: "You're 5th. 1 sale passes Ana."
 * A viewer at 0 gets "1 sale gets you on the board." On the podium, or not a
 * rep on this board at all, there's no line. Points per sale vary by plan, so
 * on the points board the gap is stated in points, not as a sale count.
 */
export function spotLine({
  entries,
  currentUser,
  unranked,
  viewerId,
  metric,
}: {
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  unranked: UnrankedRep[];
  viewerId?: string | null;
  metric: LeaderboardMetric;
}): string | null {
  if (!currentUser) {
    return viewerId && unranked.some((rep) => rep.salesRepId === viewerId)
      ? '1 sale gets you on the board.'
      : null;
  }
  if (currentUser.rank <= 3) return null;

  const spot = `You're ${ordinal(currentUser.rank)}.`;
  const above = entries.find((entry) => entry.rank === currentUser.rank - 1);
  if (!above) return spot;

  const name = tapeRepName(above.salesRepName);
  const gap = Math.max(0, leaderboardValue(above, metric) - leaderboardValue(currentUser, metric));
  if (gap === 0) return `${spot} 1 sale passes ${name}.`;
  if (metric === 'totalPoints') return `${spot} ${new Intl.NumberFormat('en-US').format(gap)} pts behind ${name}.`;
  if (gap === 1) return `${spot} 1 sale ties ${name}.`;
  return `${spot} ${gap + 1} sales pass ${name}.`;
}

/** "12m ago" for a sale logged the day it happened; the day alone ("Today",
 *  "Mon", "Sep 3") when it was logged later, as the tape does. */
export function recentSaleWhen(sale: RecentSale, nowMs: number): string {
  const atMs = Date.parse(sale.at);
  if (!Number.isFinite(atMs)) return '';
  if (!sale.dayOnly) return relativeSaleTime(atMs, nowMs, 'America/Chicago');
  if (installDayKey(new Date(atMs)) === installDayKey(new Date(nowMs))) return 'Today';
  return relativeSaleTime(Math.min(atMs, nowMs - 24 * 60 * 60_000), nowMs, 'America/Chicago');
}

export function recentSaleLabel(sale: RecentSale): string {
  const name = tapeRepName(sale.repName);
  return sale.plan ? `${name} · ${sale.plan}` : name;
}

// Ticks every minute, and at once when the app comes back to the foreground
// (timers are frozen while an installed app is in the background).
export function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', tick);
    };
  }, []);
  return now;
}
