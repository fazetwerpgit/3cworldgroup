'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Crown, Flame } from 'lucide-react';
import { Sparkline } from '@/components/leaderboard/Sparkline';

export interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
  movement?: number | null;
  spark?: (number | null)[];
  streakDays?: number;
}

type Metric = 'totalPoints' | 'totalSales';
type Period = 'week' | 'month' | 'year' | 'all';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  metric: Metric;
  period: Period;
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

function periodLabel(period: Period) {
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
      const progress = Math.min(1, (now - startedAt) / 300);
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
    return <span className="font-['Consolas'] text-[10px] font-black text-[#687384]" aria-hidden="true">—</span>;
  }
  if (movement === null || movement === undefined) {
    return <span className="border border-current px-1.5 py-[3px] text-[8px] font-black uppercase tracking-[0.12em] text-[#687384]">NEW</span>;
  }
  const up = movement > 0;
  return (
    <span className={`inline-flex items-center gap-1 font-['Consolas'] text-[10px] font-black ${up ? 'text-[#8dc63f]' : 'text-[#ad7116]'}`}>
      {up ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
      {Math.abs(movement)}
      <span className="sr-only">{up ? 'up' : 'down'} {Math.abs(movement)} since yesterday</span>
    </span>
  );
}

function StreakChip({ streakDays, mine = false }: { streakDays: number | undefined; mine?: boolean }) {
  if (!streakDays || streakDays < 2) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-[99px] px-1.5 py-[3px] text-[9px] font-black ${mine ? 'border border-[#0A1F44] bg-[#0A1F44] text-white dark:border-[#0A1F44] dark:bg-[#0A1F44] dark:text-white' : 'bg-[#0A1F44] text-[#d9a520]'}`}>
      <Flame className="size-3 fill-current" aria-hidden="true" />
      {streakDays}-day streak
    </span>
  );
}

function ChaseProgress({ current, target, highlighted }: { current: number; target: number; highlighted: boolean }) {
  const [started, setStarted] = useState(false);
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setStarted(true));
    return () => window.cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <div className="col-[2_/_-1] h-1 overflow-hidden bg-[rgba(141,198,63,0.23)] dark:bg-[rgba(10,31,68,0.24)]">
      <div className={`h-full transition-[width] duration-300 ease-out ${highlighted ? 'bg-[#8dc63f] dark:bg-[#0A1F44]' : 'bg-[#8dc63f] dark:bg-[#75869d]'}`} style={{ width: started ? `${percent}%` : '0%' }} />
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

function EmptyState() {
  return (
    <div className="border-y border-[#0A1F44] py-14 text-center dark:border-[#e7edf4]">
      <p className="font-['Trebuchet_MS'] text-lg font-black uppercase tracking-[-0.04em]">The board is wide open</p>
      <p className="mt-1 text-sm text-[#687384]">First approved sale of the period takes #1.</p>
    </div>
  );
}

function AcrossTheBoard({ entries, currentUser, metric, period }: { entries: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; metric: Metric; period: Period }) {
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
  const daysLeft = periodDaysLeft(period);

  return (
    <section className="mb-[45px] grid grid-cols-2 border-y border-[#0A1F44] dark:border-[#e7edf4] sm:grid-cols-4" aria-label="Team pulse">
      <div className="min-h-[109px] border-r border-[#0A1F44] p-[15px_17px_18px] dark:border-[#e7edf4]">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#687384]">Top closer</span>
        <strong className="mt-[18px] block truncate font-['Trebuchet_MS'] text-[20px] font-black tracking-[-0.05em]">{topCloser?.salesRepName ?? '--'}</strong>
        <span className="mt-1 block font-['Consolas'] text-[10px] text-[#687384]">{topCloser ? `${formatNumber(topCloser.totalSales)} approved sales` : 'No approved sales yet'}</span>
      </div>
      <div className="min-h-[109px] border-r border-[#0A1F44] p-[15px_17px_18px] dark:border-[#e7edf4]">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#687384]">Closest race</span>
        <strong className="mt-[18px] block font-['Trebuchet_MS'] text-[20px] font-black tracking-[-0.05em]">{race ? `#${race.above.rank} vs #${race.below.rank}` : '--'}</strong>
        <span className="mt-1 block font-['Consolas'] text-[10px] text-[#687384]">{race ? `${formatNumber(race.gap)} ${unit} apart` : 'Needs two active reps'}</span>
      </div>
      <div className="min-h-[109px] border-r border-t border-[#0A1F44] p-[15px_17px_18px] dark:border-[#e7edf4] sm:border-t-0">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#687384]">Your climb</span>
        <strong className="mt-[18px] block truncate font-['Trebuchet_MS'] text-[20px] font-black tracking-[-0.05em]">{!currentUser ? 'First sale' : soleLeader ? 'Top of the board' : currentUser.rank === 1 ? `Leading by ${formatNumber(lead ?? 0)}` : nextGap !== null ? `${formatNumber(nextGap)} ${unit}` : 'Keep climbing'}</strong>
        <span className="mt-1 block font-['Consolas'] text-[10px] text-[#687384]">{!currentUser ? 'puts you on the board' : soleLeader ? 'Only rep on the board' : currentUser.rank === 1 ? 'over #2 in pts' : nextGap !== null ? `to #${currentUser.rank - 1}` : 'next rank is outside this view'}</span>
      </div>
      <div className="min-h-[109px] border-t border-[#0A1F44] p-[15px_17px_18px] dark:border-[#e7edf4] sm:border-t-0">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#687384]">Team pulse</span>
        <strong className="mt-[18px] block font-['Trebuchet_MS'] text-[20px] font-black tracking-[-0.05em]">{formatNumber(totalPoints)} pts</strong>
        <span className="mt-1 block font-['Consolas'] text-[10px] text-[#687384]">{entries.length} reps · {daysLeft ? `${daysLeft} days left` : 'all time'}</span>
      </div>
    </section>
  );
}

function Podium({ entries, currentUser, metric, period }: { entries: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; metric: Metric; period: Period }) {
  const podium = entries.filter((entry) => entry.rank <= 3).sort((a, b) => a.rank - b.rank);
  const podiumEntries = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const gridColumns = podium.length === 3 ? 'sm:grid-cols-[1fr_1.25fr_1fr]' : podium.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1';
  const unit = metricUnit(metric);

  return (
    <section className="mb-[46px]" aria-labelledby="podium-heading">
      <div className="flex items-end justify-between border-b-[5px] border-[#0A1F44] pb-2.5 dark:border-[#e7edf4]">
        <h2 id="podium-heading" className="font-['Trebuchet_MS'] text-[22px] font-black uppercase tracking-[-0.04em]">Top performers</h2>
        <p className="text-right text-[10px] uppercase tracking-[0.15em] text-[#687384]">Approved {metric === 'totalPoints' ? 'points' : 'sales'} · {periodLabel(period)}</p>
      </div>
      <div className={`grid gap-0 bg-[#0A1F44] text-white dark:bg-[radial-gradient(circle_at_50%_31%,rgba(245,215,128,0.18),transparent_26%),linear-gradient(180deg,#0d2449,#06142b)] dark:text-[#f6f7f8] dark:shadow-[0_25px_70px_rgba(0,0,0,0.24)] ${gridColumns}`}>
        {podiumEntries.map((entry) => {
          const mine = entry.salesRepId === currentUser?.salesRepId;
          const winner = entry.rank === 1;
          const rankStyle = entry.rank === 1
            ? 'text-[#0A1F44] dark:bg-[linear-gradient(145deg,#fff3bd_0%,#f5d780_18%,#d9a520_52%,#8a6a1f_82%,#f5d780_100%)] dark:bg-clip-text dark:text-transparent dark:[text-shadow:0_0_30px_rgba(245,215,128,0.32)]'
            : entry.rank === 2
              ? 'text-white/25 dark:bg-[linear-gradient(145deg,#ffffff_0%,#e8edf2_25%,#aab6c2_56%,#6e7a86_82%,#f4f7fa_100%)] dark:bg-clip-text dark:text-transparent'
              : 'text-white/25 dark:bg-[linear-gradient(145deg,#ffe2bd_0%,#e8b98a_25%,#b4703a_55%,#7a4a22_84%,#f1c99a_100%)] dark:bg-clip-text dark:text-transparent';
          return (
            <article key={entry.salesRepId} className={`relative min-h-[256px] overflow-hidden border-r border-white/25 p-6 pb-[18px] last:border-0 dark:border-white/20 ${winner ? 'z-10 -mt-5 min-h-[306px] border border-[#f5d780]/90 bg-[#8dc63f] pt-[45px] text-[#0A1F44] dark:-mt-5 dark:border-[#f5d780]/90 dark:bg-[radial-gradient(circle_at_50%_0%,rgba(245,215,128,0.28),transparent_52%),linear-gradient(145deg,#14376d,#0a1b37_58%,#071426)] dark:text-[#f6f7f8] dark:shadow-[0_0_85px_rgba(217,165,32,0.28),inset_0_1px_0_rgba(255,255,255,0.25)]' : ''} ${mine && !winner ? 'bg-[#8dc63f]/10' : ''}`}>
              {winner && <Crown className="absolute right-[22px] top-[21px] size-7 fill-[#0A1F44] text-[#0A1F44] dark:fill-[#d9a520] dark:text-[#d9a520] dark:drop-shadow-[0_0_11px_rgba(245,215,128,0.75)]" aria-label="Gold crown" />}
              <div className={`font-['Trebuchet_MS'] text-[clamp(86px,11vw,160px)] font-black leading-[0.67] tracking-[-0.13em] ${rankStyle}`}>{String(entry.rank).padStart(2, '0')}</div>
              <div className="mt-6 flex items-center gap-[11px]">
                <span className={`grid size-[43px] shrink-0 place-items-center rounded-full bg-[#31537b] text-[11px] font-black ${winner ? 'bg-[#0A1F44] text-white dark:shadow-[0_0_20px_rgba(245,215,128,0.3)]' : ''}`}>{initialsOf(entry.salesRepName)}</span>
                <div className="min-w-0">
                  <strong className="block truncate text-[16px] font-black">{entry.salesRepName}</strong>
                  <span className="mt-[3px] block font-['Consolas'] text-[10px]">{formatNumber(entry.totalSales)} approved sales{winner ? ' · current leader' : ''}</span>
                  {mine && <span className="mt-1 inline-block bg-[#8dc63f] px-1.5 py-[3px] text-[8px] font-black uppercase tracking-[0.1em] text-[#0A1F44]">YOU</span>}
                </div>
              </div>
              <div className={`absolute bottom-[18px] right-[22px] font-['Consolas'] text-[25px] font-black ${winner ? 'text-[37px] dark:text-[#f5d780] dark:[text-shadow:0_0_15px_rgba(245,215,128,0.6)]' : ''}`}><CountUpValue value={metricValue(entry, metric)} /> <small className="font-['Trebuchet_MS'] text-[9px] tracking-[0.15em]">{unit}</small></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ChaseTable({ entries, currentUser, metric }: { entries: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; metric: Metric }) {
  const rest = entries.filter((entry) => entry.rank >= 4).sort((a, b) => a.rank - b.rank);
  if (rest.length === 0) return null;
  const unit = metricUnit(metric);
  const noHistory = entries.every((entry) => (entry.movement ?? null) === null);

  return (
    <section className="mb-[25px]" aria-labelledby="chase-heading">
      <div className="flex items-end justify-between border-b-[5px] border-[#0A1F44] pb-2.5 dark:border-[#e7edf4]">
        <h2 id="chase-heading" className="font-['Trebuchet_MS'] text-[22px] font-black uppercase tracking-[-0.04em]">The chase · ranks 4–{entries.length}</h2>
        <p className="text-right text-[10px] uppercase tracking-[0.14em] text-[#687384]">Movement since yesterday</p>
      </div>
      <div className="border-b border-[#0A1F44] dark:border-[#e7edf4]">
        <div className="hidden min-h-[38px] grid-cols-[100px_minmax(200px,1.5fr)_112px_132px_110px] items-center gap-[15px] px-3 text-[9px] font-black uppercase tracking-[0.16em] text-[#687384] sm:grid"><span>Rank / move</span><span>Rep</span><span>7-day trend</span><span className="text-right">{metric === 'totalPoints' ? 'Points' : 'Sales'}</span><span className="text-right">Gap to next</span></div>
        {rest.map((entry, index) => {
          const mine = entry.salesRepId === currentUser?.salesRepId;
          const above = entries.find((candidate) => candidate.rank === entry.rank - 1);
          const below = entries.find((candidate) => candidate.rank === entry.rank + 1);
          const currentValue = metricValue(entry, metric);
          const aboveValue = above ? metricValue(above, metric) : 0;
          const gap = above ? Math.max(0, aboveValue - currentValue) : null;
          const gapLabel = gap === null || !below ? '—' : `${formatNumber(gap)} ${unit}`;
          return (
            <div key={entry.salesRepId} className={`relative grid min-h-[77px] grid-cols-[43px_minmax(0,1fr)_auto] items-center gap-[9px] border-b border-[rgba(10,31,68,0.22)] px-1 py-2.5 transition-colors duration-150 last:border-0 hover:bg-[rgba(141,198,63,0.12)] dark:border-white/15 dark:hover:bg-[rgba(245,215,128,0.08)] sm:grid-cols-[100px_minmax(200px,1.5fr)_112px_132px_110px] sm:gap-[15px] sm:px-3 ${mine ? 'bg-[#0A1F44] text-white shadow-[inset_7px_0_#8dc63f] dark:bg-[#8dc63f] dark:text-[#0A1F44] dark:border-[#8dc63f] dark:shadow-[inset_7px_0_#d7edaf,0_0_30px_rgba(141,198,63,0.12)]' : ''}`} style={{ animationDelay: `${Math.min(index * 42, 420)}ms` }}>
              <div className="flex items-center gap-[9px] font-['Consolas']"><b className="text-[21px]">{String(entry.rank).padStart(2, '0')}</b><MovementIndicator movement={entry.movement} noHistory={noHistory} /></div>
              <div className="flex min-w-0 items-center gap-[11px]">
                <span className={`grid size-[35px] shrink-0 place-items-center rounded-full bg-[#0A1F44] text-[10px] font-black text-white ${mine ? 'dark:bg-[#0A1F44]' : ''}`}>{initialsOf(entry.salesRepName)}</span>
                <div className="min-w-0">
                  <span className={`block truncate text-[14px] font-black ${mine ? 'text-white dark:text-[#0A1F44]' : ''}`}>{entry.salesRepName}{mine && <em className="ml-[7px] bg-[#8dc63f] px-1.5 py-[3px] text-[8px] font-black uppercase not-italic tracking-[0.1em] text-[#0A1F44] dark:bg-white">YOU</em>}</span>
                  <span className={`mt-1 flex flex-wrap items-center gap-1 text-[9px] text-[#687384] ${mine ? 'text-white/70 dark:text-[#0A1F44]/70' : ''}`}>{formatNumber(entry.totalSales)} sales <StreakChip streakDays={entry.streakDays} mine={mine} /></span>
                </div>
              </div>
              <span className="hidden justify-center sm:flex"><Sparkline spark={entry.spark ?? []} mine={mine} /></span>
              <div className="num text-right font-['Consolas'] text-[17px] font-black">{formatNumber(currentValue)} <small className={`font-['Trebuchet_MS'] text-[9px] tracking-[0.12em] ${mine ? 'text-white/70 dark:text-[#0A1F44]/70' : 'text-[#687384]'}`}>{unit}</small></div>
              <div className={`${gap === null || !below ? 'grid size-7 place-items-center rounded-full p-0 text-[13px]' : 'rounded-[99px] px-2 py-1'} col-span-2 justify-self-start border border-[#0A1F44] font-['Consolas'] text-[10px] whitespace-nowrap sm:col-span-1 sm:justify-self-end ${mine ? 'border-[#0A1F44] bg-[#0A1F44] text-white dark:border-[#0A1F44] dark:bg-[#0A1F44]' : 'dark:border-[#e7edf4]'}`}>{gapLabel}</div>
              {mine && <ChaseProgress current={currentValue} target={aboveValue} highlighted />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LeaderboardTable({ entries, currentUser, metric, period }: LeaderboardTableProps) {
  if (entries.length === 0) return <EmptyState />;
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);

  return (
    <div>
      <Podium entries={ordered} currentUser={currentUser} metric={metric} period={period} />
      <AcrossTheBoard entries={ordered} currentUser={currentUser} metric={metric} period={period} />
      <ChaseTable entries={ordered} currentUser={currentUser} metric={metric} />
      <footer className="flex justify-between gap-3 border-t border-[#0A1F44] pt-3 text-[10px] text-[#687384] dark:border-[#e7edf4] max-sm:block">
        <span>Rankings use approved sales for the selected period.</span>
        <span className="max-sm:mt-2 max-sm:block">Point values vary by product and plan · refreshed moments ago.</span>
      </footer>
    </div>
  );
}
