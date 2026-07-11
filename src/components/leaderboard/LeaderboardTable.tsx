'use client';

import { useEffect, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, ArrowUpRight, Crown, Flame, Target, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  currentUserId?: string;
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

// Medal tints are intentionally limited to the podium identity treatment.
const medal: Record<number, { chip: string; ring: string; label: string }> = {
  1: {
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    ring: 'ring-amber-300 dark:ring-amber-500/50',
    label: '1st',
  },
  2: {
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-500/30 dark:text-slate-300',
    ring: 'ring-slate-300 dark:ring-slate-500/50',
    label: '2nd',
  },
  3: {
    chip: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
    ring: 'ring-orange-300 dark:ring-orange-500/50',
    label: '3rd',
  },
};

function CountUpValue({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      const frame = window.requestAnimationFrame(() => setDisplayValue(value));
      return () => window.cancelAnimationFrame(frame);
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

// Movement since end of yesterday. noHistory = first day of a period (every
// movement is null) — render a neutral dash instead of a wall of "New".
function MovementIndicator({ movement, noHistory }: { movement: number | null | undefined; noHistory: boolean }) {
  if (noHistory || movement === 0) {
    return <span className="text-xs font-bold text-slate-300 dark:text-muted-foreground" aria-hidden="true">-</span>;
  }
  if (movement === null || movement === undefined) {
    return (
      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:border-border dark:bg-muted/50 dark:text-muted-foreground">
        New
      </span>
    );
  }
  const up = movement > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? 'text-[#5f8f20] dark:text-[#8dc63f]' : 'text-amber-600 dark:text-amber-400'}`}>
      {up ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
      {Math.abs(movement)}
      <span className="sr-only">{up ? 'up' : 'down'} {Math.abs(movement)} since yesterday</span>
    </span>
  );
}

// Consecutive selling days; hidden below 2 so rows aren't noisy.
function StreakChip({ streakDays }: { streakDays: number | undefined }) {
  if (!streakDays || streakDays < 2) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <Flame className="size-3" aria-hidden="true" />
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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-slate-100 dark:bg-white/[0.06]">
      <div
        className={`h-full rounded-r-full transition-[width] duration-300 ease-out ${highlighted ? 'bg-[#8dc63f]' : 'bg-slate-400 dark:bg-slate-500'}`}
        style={{ width: started ? `${percent}%` : '0%' }}
      />
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
    <Card className="rounded-lg border-slate-200 bg-white p-10 text-center shadow-sm dark:border-border dark:bg-card">
      <Trophy className="mx-auto mb-3 size-10 text-slate-300 dark:text-muted-foreground" aria-hidden="true" />
      <p className="font-medium text-slate-950 dark:text-foreground">The board is wide open</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">First approved sale of the period takes #1.</p>
    </Card>
  );
}

function AcrossTheBoard({ entries, currentUser, metric, period }: { entries: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; metric: Metric; period: Period }) {
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const unit = metricUnit(metric);
  const topCloser = [...entries].sort((a, b) => b.totalSales - a.totalSales)[0];
  const race = ordered.slice(0, -1).reduce<{ above: LeaderboardEntry; below: LeaderboardEntry; gap: number } | null>((best, above, index) => {
    const below = ordered[index + 1];
    const aboveValue = metricValue(above, metric);
    const belowValue = metricValue(below, metric);
    if (aboveValue === 0 || belowValue === 0) return best;
    const candidate = { above, below, gap: Math.max(0, aboveValue - belowValue) };
    return !best || candidate.gap < best.gap ? candidate : best;
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
    <section className="portal-enter portal-enter-4" aria-labelledby="across-the-board-heading">
      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card lg:grid-cols-[116px_minmax(0,1fr)]">
        <div className="flex min-h-[76px] items-center justify-center border-b border-slate-100 bg-slate-50 px-4 dark:border-border dark:bg-muted/30 lg:border-b-0 lg:border-r">
          <span id="across-the-board-heading" className="text-center text-[11px] font-bold uppercase leading-relaxed tracking-[0.16em] text-[#5f8f20] dark:text-[#8dc63f]">Across the board</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-border sm:grid-cols-4 sm:divide-y-0">
          <div className="min-h-[116px] p-4 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.03] sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-muted-foreground">Top closer</p>
              <Trophy className="size-4 text-[#5f8f20] dark:text-[#8dc63f]" aria-hidden="true" />
            </div>
            <p className="portal-display mt-4 truncate text-lg font-bold tracking-tight text-slate-950 dark:text-foreground">{topCloser?.salesRepName ?? '--'}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{topCloser ? <><strong className="text-slate-950 dark:text-foreground">{formatNumber(topCloser.totalSales)}</strong> approved sales</> : 'No approved sales yet'}</p>
          </div>
          <div className="min-h-[116px] p-4 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.03] sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-muted-foreground">Closest race</p>
              <Target className="size-4 text-[#5f8f20] dark:text-[#8dc63f]" aria-hidden="true" />
            </div>
            <p className="portal-display mt-4 text-lg font-bold tracking-tight text-slate-950 dark:text-foreground">{race ? `#${race.above.rank} vs #${race.below.rank}` : '--'}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{race ? <><strong className="text-slate-950 dark:text-foreground">{formatNumber(race.gap)} {unit} apart</strong></> : 'Needs two active reps'}</p>
          </div>
          <div className="min-h-[116px] p-4 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.03] sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-muted-foreground">Your climb</p>
              <ArrowUpRight className="size-4 text-[#5f8f20] dark:text-[#8dc63f]" aria-hidden="true" />
            </div>
            <p className="portal-display mt-4 truncate text-lg font-bold tracking-tight text-slate-950 dark:text-foreground">{!currentUser ? 'First sale' : soleLeader ? 'Top of the board' : currentUser.rank === 1 ? `Leading by ${formatNumber(lead ?? 0)}` : nextGap !== null ? `${formatNumber(nextGap)} ${unit}` : 'Keep climbing'}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{!currentUser ? 'puts you on the board' : soleLeader ? 'Only rep on the board' : currentUser.rank === 1 ? `over #2 in ${unit}` : nextGap !== null ? `to #${currentUser.rank - 1}` : 'next rank is outside this view'}</p>
          </div>
          <div className="min-h-[116px] p-4 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.03] sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-muted-foreground">Team pulse</p>
              <Activity className="size-4 text-[#5f8f20] dark:text-[#8dc63f]" aria-hidden="true" />
            </div>
            <p className="portal-display mt-4 text-lg font-bold tracking-tight text-slate-950 dark:text-foreground">{formatNumber(totalPoints)} pts</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground"><strong className="text-slate-950 dark:text-foreground">{entries.length} reps</strong> on the board{daysLeft !== null ? ` / ${daysLeft} days left` : ''}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Podium({ entries, currentUserId, metric, noHistory }: { entries: LeaderboardEntry[]; currentUserId?: string; metric: Metric; noHistory: boolean }) {
  const podium = entries.filter((entry) => entry.rank <= 3).sort((a, b) => a.rank - b.rank);
  const podiumOrder: Record<number, string> = {
    1: 'sm:order-2',
    2: 'sm:order-1',
    3: 'sm:order-3',
  };
  const unit = metricUnit(metric);

  return (
    <section className="portal-enter portal-enter-3" aria-labelledby="podium-heading">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-muted-foreground">Top performers</p>
          <h2 id="podium-heading" className="portal-display mt-1 text-lg font-bold tracking-tight text-slate-950 dark:text-foreground">The podium</h2>
        </div>
        <p className="text-right text-xs text-slate-500 dark:text-muted-foreground">{metric === 'totalPoints' ? 'Approved points' : 'Approved sales'}</p>
      </div>
      <div className="relative grid gap-3 pb-3 sm:grid-cols-3 sm:items-end">
        {podium.map((entry) => {
          const mine = entry.salesRepId === currentUserId;
          const m = medal[entry.rank];
          const winner = entry.rank === 1;
          return (
            <Card
              key={entry.salesRepId}
              className={`relative overflow-hidden rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-md dark:border-border dark:bg-card ${podiumOrder[entry.rank] ?? ''} ${winner ? 'border-t-2 border-t-[#8dc63f] sm:-mt-3' : 'sm:mt-2'} ${mine ? 'bg-[#8dc63f]/5 dark:bg-[#8dc63f]/10' : ''}`}
            >
              {winner && <Crown className="absolute right-5 top-5 size-7 text-amber-500/80" aria-label="Top ranked" />}
              <CardContent className={`relative p-5 ${winner ? 'sm:p-6' : ''}`}>
                <div className={`mx-auto grid place-items-center rounded-full bg-[#0A1F44]/[0.06] text-sm font-bold text-[#0A1F44] ring-2 dark:bg-white/10 dark:text-white ${winner ? 'size-16 ring-[3px]' : 'size-12'} ${m.ring}`}>
                  {initialsOf(entry.salesRepName)}
                </div>
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${m.chip}`}>{m.label}</span>
                  {mine && <Badge className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">You</Badge>}
                  <MovementIndicator movement={entry.movement} noHistory={noHistory} />
                </div>
                <div className="mt-1.5 flex justify-center empty:hidden">
                  <StreakChip streakDays={entry.streakDays} />
                </div>
                <p className="mt-2 truncate font-semibold text-slate-950 dark:text-foreground">{entry.salesRepName}</p>
                <p className={`portal-display portal-num mt-4 font-extrabold tracking-tight text-slate-950 dark:text-foreground ${winner ? 'text-5xl' : 'text-4xl'}`}>
                  <CountUpValue value={metricValue(entry, metric)} /> <span className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-muted-foreground">{unit}</span>
                </p>
                <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-border dark:text-muted-foreground">
                  <strong className="text-slate-950 dark:text-foreground">{formatNumber(entry.totalSales)}</strong> approved {entry.totalSales === 1 ? 'sale' : 'sales'}
                </div>
              </CardContent>
            </Card>
          );
        })}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-px bg-slate-200 shadow-[0_5px_18px_rgba(10,31,68,0.08)] dark:bg-border sm:block" />
      </div>
    </section>
  );
}

function ChaseTable({ entries, currentUser, currentUserId, metric, noHistory }: { entries: LeaderboardEntry[]; currentUser?: LeaderboardEntry | null; currentUserId?: string; metric: Metric; noHistory: boolean }) {
  const rest = entries.filter((entry) => entry.rank >= 4).sort((a, b) => a.rank - b.rank);
  if (rest.length === 0) return null;
  const unit = metricUnit(metric);
  const ownRank = currentUser?.rank ?? null;

  return (
    <section className="portal-enter portal-enter-4" aria-labelledby="chase-heading">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-muted-foreground">Your race &middot; ranks 4+</p>
          <h2 id="chase-heading" className="portal-display mt-1 text-lg font-bold tracking-tight text-slate-950 dark:text-foreground">The chase</h2>
        </div>
        <p className="text-right text-xs text-slate-500 dark:text-muted-foreground">Every rep stays on the board.</p>
      </div>
      <Card className="overflow-hidden rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
        <div className="hidden grid-cols-[76px_minmax(0,1fr)_64px_110px_120px] items-center gap-4 border-b border-slate-100 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:border-border dark:text-muted-foreground sm:grid">
          <span>Rank</span><span>Rep</span><span className="text-center">Trend</span><span className="text-right">{metric === 'totalPoints' ? 'Points' : 'Sales'}</span><span className="text-right">Gap to next</span>
        </div>
        <CardContent className="space-y-0 px-0">
          {rest.map((entry, index) => {
            const mine = entry.salesRepId === currentUserId;
            const neighbor = ownRank !== null && Math.abs(entry.rank - ownRank) === 1;
            const above = entries.find((candidate) => candidate.rank === entry.rank - 1);
            const currentValue = metricValue(entry, metric);
            const aboveValue = above ? metricValue(above, metric) : 0;
            const gap = above ? Math.max(0, aboveValue - currentValue) : null;
            return (
              <div
                key={entry.salesRepId}
                className={`portal-enter relative border-b border-slate-100 transition-colors duration-200 last:border-b-0 hover:bg-slate-50 dark:border-border dark:hover:bg-white/[0.035] ${mine ? 'border-l-2 border-l-[#8dc63f] bg-[#8dc63f]/[0.07] dark:bg-[#8dc63f]/10' : ''}`}
                style={{ animationDelay: `${Math.min(index * 42, 420)}ms` }}
              >
                <div className="grid min-h-[72px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[76px_minmax(0,1fr)_64px_110px_120px] sm:gap-4 sm:px-5">
                  <span className="flex items-center gap-1.5">
                    <span className="portal-num grid size-8 shrink-0 place-items-center rounded-md bg-slate-100 text-sm font-bold text-slate-500 dark:bg-muted dark:text-muted-foreground sm:size-9">{entry.rank}</span>
                    <span className="hidden sm:inline-flex"><MovementIndicator movement={entry.movement} noHistory={noHistory} /></span>
                  </span>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0A1F44]/[0.07] text-[11px] font-bold text-[#0A1F44] dark:bg-white/10 dark:text-white">{initialsOf(entry.salesRepName)}</span>
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${mine ? 'font-semibold text-slate-950 dark:text-foreground' : 'text-slate-700 dark:text-foreground'}`}>{entry.salesRepName}</p>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {mine && <Badge className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">You</Badge>}
                        <span className="inline-flex sm:hidden"><MovementIndicator movement={entry.movement} noHistory={noHistory} /></span>
                        <StreakChip streakDays={entry.streakDays} />
                        <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold sm:hidden ${mine ? 'border-[#8dc63f]/30 bg-[#8dc63f]/10 text-[#5f8f20] dark:text-[#8dc63f]' : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-border dark:bg-muted/50 dark:text-muted-foreground'}`}>
                          {gap === null ? '--' : mine ? `${formatNumber(gap)} ${unit} to #${entry.rank - 1}` : `${formatNumber(gap)} ${unit}`}
                        </span>
                      </span>
                    </div>
                  </div>
                  <span className="hidden justify-center sm:flex"><Sparkline spark={entry.spark ?? []} mine={mine} /></span>
                  <p className="portal-display portal-num text-right text-lg font-extrabold tracking-tight text-slate-950 dark:text-foreground">{formatNumber(currentValue)} <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-muted-foreground">{unit}</span></p>
                  <p className={`hidden justify-self-end rounded-full border px-2 py-1 text-right text-[10px] font-semibold sm:inline-flex ${mine ? 'border-[#8dc63f]/30 bg-[#8dc63f]/10 text-[#5f8f20] dark:text-[#8dc63f]' : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-border dark:bg-muted/50 dark:text-muted-foreground'}`}>{gap === null ? '--' : mine ? `${formatNumber(gap)} ${unit} to #${entry.rank - 1}` : `${formatNumber(gap)} ${unit}`}</p>
                </div>
                {neighbor || mine ? <ChaseProgress current={currentValue} target={aboveValue} highlighted={mine} /> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

export function LeaderboardTable({ entries, currentUser, currentUserId, metric, period }: LeaderboardTableProps) {
  if (entries.length === 0) return <EmptyState />;
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const noHistory = ordered.every((entry) => (entry.movement ?? null) === null);

  return (
    <div className="space-y-5">
      <Podium entries={ordered} currentUserId={currentUserId} metric={metric} noHistory={noHistory} />
      <AcrossTheBoard entries={ordered} currentUser={currentUser} metric={metric} period={period} />
      <ChaseTable entries={ordered} currentUser={currentUser} currentUserId={currentUserId} metric={metric} noHistory={noHistory} />
      <p className="px-1 text-xs text-slate-400 dark:text-muted-foreground">Rankings use approved sales for the selected period. Point values vary by product and plan.</p>
    </div>
  );
}
