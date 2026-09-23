'use client';

import { LeaderboardRows } from './LeaderboardRows';
import { Podium } from './Podium';
import { Avatar } from './Avatar';
import { LeaderboardStage } from './LeaderboardStage';
import { RecentSales } from './RecentSales';
import { spotLine, zeroEntries } from './belowPodium';
import type { RecentSale, UnrankedRep } from '@/lib/leaderboard/team';
import styles from './leaderboard.module.css';

export interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
  avatar?: string | null;
  movement?: number | null;
  spark?: (number | null)[];
  streakDays?: number;
}

export type LeaderboardMetric = 'totalPoints' | 'totalSales';
export type LeaderboardPeriod = 'week' | 'month' | 'year' | 'all';

export interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  viewer?: LeaderboardViewer | null;
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  /** Active reps with nothing on the board this period, listed after the ranks. */
  unranked?: UnrankedRep[];
  /** The newest standing sales, team-wide: name, plan, time. */
  recent?: RecentSale[];
}

export interface LeaderboardViewer {
  uid: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export function leaderboardValue(entry: LeaderboardEntry, metric: LeaderboardMetric) {
  return metric === 'totalPoints' ? entry.totalPoints : entry.totalSales;
}

export function leaderboardUnit(metric: LeaderboardMetric) {
  return metric === 'totalPoints' ? 'pts' : 'sales';
}

export function formatLeaderboardValue(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <p className="portal-display">The board is open</p>
      <span>Approved activity will appear here.</span>
    </div>
  );
}

function periodSuffix(period: LeaderboardPeriod) {
  if (period === 'month') return 'this month';
  if (period === 'year') return 'this year';
  if (period === 'all') return 'all time';
  return 'this week';
}

export function LeaderboardTable({
  entries,
  currentUser,
  viewer,
  metric,
  period,
  unranked = [],
  recent = [],
}: LeaderboardProps) {
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const podiumEntries = ordered.filter((entry) => entry.rank <= 3);
  const viewerEntry = viewer
    ? ordered.find((entry) => entry.salesRepId === viewer.uid)
    : undefined;
  const zeros = zeroEntries(ordered, unranked);
  const viewerZero = viewer ? zeros.find((entry) => entry.salesRepId === viewer.uid) : undefined;
  const effectiveCurrentUser = currentUser ?? viewerEntry ?? viewerZero;
  const currentUserIsVisible = Boolean(
    effectiveCurrentUser &&
      [...ordered, ...zeros].some((entry) => entry.salesRepId === effectiveCurrentUser.salesRepId)
  );
  const spot = spotLine({ entries: ordered, currentUser, unranked, viewerId: viewer?.uid, metric });
  const viewerFallback: LeaderboardEntry | undefined = viewer && !currentUser
    ? {
      rank: 0,
      salesRepId: viewer.uid,
      salesRepName: viewer.displayName || 'You',
      avatar: viewer.avatarUrl,
      totalSales: 0,
      totalPoints: 0,
    }
    : undefined;
  const standingEntry = currentUser
    ? {
      ...currentUser,
      salesRepName: currentUser.salesRepName || viewer?.displayName || 'You',
      avatar: currentUser.avatar ?? viewer?.avatarUrl,
    }
    : viewerFallback;

  // On a zero-entry board the empty card already says the board is open, so an
  // "unranked, 0 pts" bar would only repeat it and cover the card.
  const showsStandingBar = Boolean(standingEntry && !currentUserIsVisible && entries.length > 0);

  const rowEntries = ordered.filter((entry) => entry.rank >= 4);

  return (
    <div className={styles.board}>
      <LeaderboardStage period={period}>
        <Podium entries={podiumEntries} currentUser={effectiveCurrentUser} metric={metric} />
      </LeaderboardStage>
      {spot ? <p className={styles.spot} data-testid="spot-line">{spot}</p> : null}
      {entries.length === 0 ? <EmptyState /> : null}
      <LeaderboardRows entries={rowEntries} zeros={zeros} currentUser={effectiveCurrentUser} metric={metric} />
      <RecentSales sales={recent} />
      {showsStandingBar ? (
        <div className={styles.standing} aria-label="Your standing">
          <Avatar entry={standingEntry} size="row" decorative={false} />
          {currentUser ? (
            <span className={styles.standingCopy} data-testid="standing-copy">
              You · #{currentUser.rank} · {formatLeaderboardValue(leaderboardValue(currentUser, metric))} {leaderboardUnit(metric)}
            </span>
          ) : (
            <span className={styles.standingCopy} data-testid="standing-copy">You · unranked · 0 {leaderboardUnit(metric)} {periodSuffix(period)}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
