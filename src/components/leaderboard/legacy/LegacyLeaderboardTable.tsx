'use client';

/* The desktop leaderboard as it shipped on master (1a0b836f), moved here
   unchanged apart from its name and its import of the sparkline. The phone
   redesign lives beside it in src/components/leaderboard; this tree is what
   >=1024px renders, and its layout and content stay as on master: edit it
   only to keep it compiling. Its panel surfaces read the portal's C tokens
   (--c-panel / --c-raised) instead of the old navy gradients. Below the
   podium it also carries the team at 0 after the ranks and the recent sales
   feed, shared with the phone board (../belowPodium). Taste pass (Oct 2026):
   the markup reads leaderboard-desk.module.css, flat like the phone board. */

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Crown, Flame } from 'lucide-react';
import { LegacySparkline } from './LegacySparkline';
import d from './leaderboard-desk.module.css';
import type { LeaderboardEntry } from '../LeaderboardTable';
import { recentSaleLabel, recentSaleWhen, spotLine, useMinuteClock, zeroEntries } from '../belowPodium';
import type { RecentSale, UnrankedRep } from '@/lib/leaderboard/team';
import { monthLabel, type MonthKey } from '@/lib/sales/monthWindow';

type Metric = 'totalPoints' | 'totalSales';
type Period = 'week' | 'month' | 'year' | 'all';

interface LegacyLeaderboardTableProps {
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  metric: Metric;
  period: Period;
  /** Active reps with nothing on the board this period, listed after the ranks. */
  unranked?: UnrankedRep[];
  /** The newest standing sales, team-wide: name, plan, time. */
  recent?: RecentSale[];
  viewerId?: string | null;
  /** A past month on the month board: closed, so no days left or movement. */
  pastMonth?: MonthKey | null;
}

const formatNumber = (n: number) => new Intl.NumberFormat('en-US').format(n);

function initialsOf(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function metricValue(entry: LeaderboardEntry, metric: Metric) {
  return metric === 'totalPoints' ? entry.totalPoints : entry.totalSales;
}

function metricUnit(metric: Metric) {
  return metric === 'totalPoints' ? 'pts' : 'sales';
}

function periodLabel(period: Period, pastMonth: MonthKey | null = null) {
  if (period === 'month' && pastMonth) return monthLabel(pastMonth);
  return period === 'week' ? 'week to date' : period === 'month' ? 'month to date' : period === 'year' ? 'year to date' : 'all time';
}

function CountUpValue({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      const reducedFrame = window.requestAnimationFrame(() => setDisplayValue(value));
      return () => window.cancelAnimationFrame(reducedFrame);
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / 300));
      setDisplayValue(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return <>{formatNumber(displayValue)}</>;
}

function MovementIndicator({ movement, noHistory }: { movement: number | null | undefined; noHistory: boolean }) {
  if (noHistory || movement === 0) {
    return <span className={`${d.move} ${d.moveFlat}`} aria-hidden="true">-</span>;
  }
  if (movement === null || movement === undefined) {
    return <span className={d.newTag}>New</span>;
  }
  const up = movement > 0;
  return (
    <span className={`${d.move} ${up ? d.moveUp : d.moveDown}`}>
      {up ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />}
      {Math.abs(movement)}
      <span className="sr-only">{up ? 'up' : 'down'} {Math.abs(movement)} since yesterday</span>
    </span>
  );
}

function StreakChip({ streakDays }: { streakDays: number | undefined }) {
  if (!streakDays || streakDays < 2) return null;
  return (
    <span className={d.streak}>
      <Flame className="size-3.5 fill-current" aria-hidden="true" />
      {streakDays}-day streak
    </span>
  );
}

function ChaseProgress({ current, target }: { current: number; target: number }) {
  const [started, setStarted] = useState(false);
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setStarted(true));
    return () => window.cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <div className={d.chase}>
      <div style={{ width: started ? `${percent}%` : '0%' }} />
    </div>
  );
}

function periodDaysLeft(period: Period) {
  if (period === 'all') return null;
  const now = new Date();
  const end = period === 'week'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7))
    : period === 'month'
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : new Date(now.getFullYear() + 1, 0, 1);
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
}

function EmptyState({ pastMonth }: { pastMonth: MonthKey | null }) {
  return (
    <div className={d.empty}>
      <p className={d.emptyTitle}>{pastMonth ? 'No approved sales' : 'The board is wide open'}</p>
      <p className={d.emptyText}>{pastMonth ? `Nothing was approved in ${monthLabel(pastMonth)}.` : 'First approved sale of the period takes #1.'}</p>
    </div>
  );
}

function AcrossTheBoard({ entries, currentUser, metric, period, pastMonth }: { entries: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; metric: Metric; period: Period; pastMonth: MonthKey | null }) {
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const unit = metricUnit(metric);
  const topCloser = [...entries].sort((a, b) => b.totalSales - a.totalSales)[0];
  const race = ordered.slice(0, -1).reduce<{ above: LeaderboardEntry; below: LeaderboardEntry; gap: number } | null>((best, above, index) => {
    const below = ordered[index + 1];
    const gap = Math.max(0, metricValue(above, metric) - metricValue(below, metric));
    if (metricValue(above, metric) === 0 || metricValue(below, metric) === 0) return best;
    return !best || gap < best.gap ? { above, below, gap } : best;
  }, null);
  const aboveUser = currentUser ? ordered.find((entry) => entry.rank === currentUser.rank - 1) : undefined;
  const belowUser = currentUser ? ordered.find((entry) => entry.rank === currentUser.rank + 1) : undefined;
  const userValue = currentUser ? metricValue(currentUser, metric) : 0;
  const nextGap = aboveUser ? Math.max(0, metricValue(aboveUser, metric) - userValue) : null;
  const lead = currentUser?.rank === 1 && belowUser ? Math.max(0, userValue - metricValue(belowUser, metric)) : null;
  const soleLeader = currentUser?.rank === 1 && !belowUser;
  const totalPoints = entries.reduce((sum, entry) => sum + entry.totalPoints, 0);
  const daysLeft = pastMonth ? null : periodDaysLeft(period);

  return (
    <section className={d.pulse} aria-label="Team pulse">
      <div className={d.stat}>
        <span className={d.statLabel}>Top closer</span>
        <strong className={d.statValue}>{topCloser?.salesRepName ?? '--'}</strong>
        <span className={d.statSub}>{topCloser ? `${formatNumber(topCloser.totalSales)} approved sales` : 'No approved sales yet'}</span>
      </div>
      <div className={d.stat}>
        <span className={d.statLabel}>Closest race</span>
        <strong className={d.statValue}>{race ? `#${race.above.rank} vs #${race.below.rank}` : '--'}</strong>
        <span className={d.statSub}>{race ? `${formatNumber(race.gap)} ${unit} apart` : 'Needs two active reps'}</span>
      </div>
      <div className={d.stat}>
        <span className={d.statLabel}>Your climb</span>
        <strong className={d.statValue}>{!currentUser ? 'First sale' : soleLeader ? 'Top of the board' : currentUser.rank === 1 ? `Leading by ${formatNumber(lead ?? 0)}` : nextGap !== null ? `${formatNumber(nextGap)} ${unit}` : 'Keep climbing'}</strong>
        <span className={d.statSub}>{!currentUser ? 'puts you on the board' : soleLeader ? 'Only rep on the board' : currentUser.rank === 1 ? 'over #2 in pts' : nextGap !== null ? `to #${currentUser.rank - 1}` : 'next rank is outside this view'}</span>
      </div>
      <div className={d.stat}>
        <span className={d.statLabel}>Team pulse</span>
        <strong className={d.statValue}>{formatNumber(totalPoints)} pts</strong>
        <span className={d.statSub}>{entries.length} reps, {pastMonth ? monthLabel(pastMonth) : daysLeft ? `${daysLeft} days left` : 'all time'}</span>
      </div>
    </section>
  );
}

function Podium({ entries, currentUser, metric, period, pastMonth }: { entries: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; metric: Metric; period: Period; pastMonth: MonthKey | null }) {
  const podium = entries.filter((entry) => entry.rank <= 3).sort((a, b) => a.rank - b.rank);
  const podiumEntries = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const gridColumns = podium.length === 3 ? d.podium3 : podium.length === 2 ? d.podium2 : d.podium1;
  const unit = metricUnit(metric);

  return (
    <section className={d.section} aria-labelledby="podium-heading">
      <div className={d.secHead}>
        <h2 id="podium-heading" className={d.secTitle}>Top performers</h2>
        <p className={d.secMeta}>Approved {metric === 'totalPoints' ? 'points' : 'sales'} · {periodLabel(period, pastMonth)}</p>
      </div>
      <div className={`${d.podium} ${gridColumns}`}>
        {podiumEntries.map((entry) => {
          const mine = entry.salesRepId === currentUser?.salesRepId;
          const winner = entry.rank === 1;
          return (
            <article key={entry.salesRepId} className={[d.pod, winner ? d.podWin : '', mine ? d.podMine : ''].filter(Boolean).join(' ')}>
              {winner && <Crown className={d.crown} aria-label="Gold crown" />}
              <div className={`${d.podNum} ${entry.rank === 3 ? d.podNum3 : ''}`}>{entry.rank}</div>
              <div className={d.podWho}>
                <span className={d.podAvatar}>{initialsOf(entry.salesRepName)}</span>
                <div className="min-w-0">
                  <strong className={d.podName}>{entry.salesRepName}{mine && <em className={d.you}>You</em>}</strong>
                  <span className={d.podSub}>{formatNumber(entry.totalSales)} approved sales{winner && !pastMonth ? ', current leader' : ''}</span>
                </div>
              </div>
              <div className={d.podScore}><CountUpValue value={metricValue(entry, metric)} /><small className={d.unit}>{unit}</small></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ChaseTable({ entries, zeros, currentUser, metric, pastMonth = null }: { entries: LeaderboardEntry[]; zeros: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; metric: Metric; pastMonth?: MonthKey | null }) {
  const rest = entries.filter((entry) => entry.rank >= 4).sort((a, b) => a.rank - b.rank);
  if (rest.length === 0 && zeros.length === 0) return null;
  const lastRank = (zeros.length > 0 ? zeros[zeros.length - 1] : rest[rest.length - 1]).rank;
  const unit = metricUnit(metric);
  const noHistory = entries.every((entry) => (entry.movement ?? null) === null);

  return (
    <section className={d.section} aria-labelledby="chase-heading">
      <div className={d.secHead}>
        <h2 id="chase-heading" className={d.secTitle}>{lastRank <= 4 ? 'Rank 4' : `Ranks 4 to ${lastRank}`}</h2>
        <p className={d.secMeta}>{pastMonth ? monthLabel(pastMonth) : 'Movement since yesterday'}</p>
      </div>
      <div className={d.table}>
        <div className={`${d.cols} ${d.thead}`}><span>{pastMonth ? 'Rank' : 'Rank / move'}</span><span>Rep</span><span>{pastMonth ? '' : '7-day trend'}</span><span className={d.right}>{metric === 'totalPoints' ? 'Points' : 'Sales'}</span><span className={d.right}>Gap to next</span></div>
        {rest.map((entry, index) => {
          const mine = entry.salesRepId === currentUser?.salesRepId;
          const above = entries.find((candidate) => candidate.rank === entry.rank - 1);
          const below = entries.find((candidate) => candidate.rank === entry.rank + 1);
          const currentValue = metricValue(entry, metric);
          const aboveValue = above ? metricValue(above, metric) : 0;
          const gap = above ? Math.max(0, aboveValue - currentValue) : null;
          const gapLabel = gap === null || !below ? '—' : `${formatNumber(gap)} ${unit}`;
          return (
            <div key={entry.salesRepId} className={`${d.cols} ${d.row} ${mine ? d.rowMine : ''}`} style={{ animationDelay: `${Math.min(index * 42, 420)}ms` }}>
              <div className={d.rankCell}><b className={d.rank}>{entry.rank}</b>{pastMonth ? null : <MovementIndicator movement={entry.movement} noHistory={noHistory} />}</div>
              <div className={d.who}>
                <span className={d.avatar}>{initialsOf(entry.salesRepName)}</span>
                <div className="min-w-0">
                  <span className={d.name}>{entry.salesRepName}{mine && <em className={d.you}>You</em>}</span>
                  <span className={d.sub}>{formatNumber(entry.totalSales)} sales <StreakChip streakDays={entry.streakDays} /></span>
                </div>
              </div>
              <span className={d.trend}>{pastMonth ? null : <LegacySparkline spark={entry.spark ?? []} mine={mine} />}</span>
              <div className={d.points}>{formatNumber(currentValue)}<small className={d.unit}>{unit}</small></div>
              <div className={`${d.gap} ${gap === null || !below ? d.gapNone : ''}`}>{gapLabel}</div>
              {mine && <ChaseProgress current={currentValue} target={aboveValue} />}
            </div>
          );
        })}
        {/* The team at 0: the same grid, one step quieter, no trend or gap. */}
        {zeros.map((entry) => {
          const mine = entry.salesRepId === currentUser?.salesRepId;
          return (
            <div key={entry.salesRepId} data-zero className={`${d.cols} ${d.row} ${d.rowZero} ${mine ? d.rowMine : ''}`}>
              <div className={d.rankCell}><b className={d.rank}>{entry.rank}</b></div>
              <div className={d.who}>
                <span className={d.avatar}>{initialsOf(entry.salesRepName)}</span>
                <span className={d.name}>{entry.salesRepName}{mine && <em className={d.you}>You</em>}</span>
              </div>
              <span aria-hidden="true" />
              <div className={d.points}>0<small className={d.unit}>{unit}</small></div>
              <span aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentSales({ sales }: { sales: RecentSale[] }) {
  const now = useMinuteClock();
  if (sales.length === 0) return null;

  return (
    <section className={d.section} aria-labelledby="recent-heading">
      <div className={d.secHead}>
        <h2 id="recent-heading" className={d.secTitle}>Recent sales</h2>
        <p className={d.secMeta}>Team-wide, newest first</p>
      </div>
      <ol className={d.feed}>
        {sales.map((sale, index) => (
          <li key={`${sale.at}-${index}`}>
            <span>{recentSaleLabel(sale)}</span>
            <time dateTime={sale.at}>{recentSaleWhen(sale, now)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LegacyLeaderboardTable({ entries, currentUser, metric, period, unranked = [], recent = [], viewerId, pastMonth = null }: LegacyLeaderboardTableProps) {
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const zeros = zeroEntries(ordered, unranked);
  const mine = currentUser ?? (viewerId ? zeros.find((entry) => entry.salesRepId === viewerId) : undefined);

  // With nobody ranked there's no Team pulse, so the spot line stands in for
  // its "Your climb"; on a ranked board that card already says it.
  if (entries.length === 0) {
    const spot = spotLine({ entries: ordered, currentUser, unranked, viewerId, metric });
    return (
      <div>
        <EmptyState pastMonth={pastMonth} />
        {spot && <p data-testid="spot-line" className={d.spot}>{spot}</p>}
        <div className={d.afterEmpty}>
          <ChaseTable entries={ordered} zeros={zeros} currentUser={mine} metric={metric} pastMonth={pastMonth} />
          <RecentSales sales={recent} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Podium entries={ordered} currentUser={currentUser} metric={metric} period={period} pastMonth={pastMonth} />
      <AcrossTheBoard entries={ordered} currentUser={currentUser} metric={metric} period={period} pastMonth={pastMonth} />
      <ChaseTable entries={ordered} zeros={zeros} currentUser={mine} metric={metric} pastMonth={pastMonth} />
      <RecentSales sales={recent} />
      <footer className={d.foot}>
        <span>Rankings use approved sales for the selected period.</span>
        <span>Point values vary by product and plan · refreshed moments ago.</span>
      </footer>
    </div>
  );
}
