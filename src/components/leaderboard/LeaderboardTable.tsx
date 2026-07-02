'use client';

import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  metric: 'totalPoints' | 'totalSales';
}

const formatNumber = (n: number) => new Intl.NumberFormat('en-US').format(n);

function initialsOf(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Medal tints for the podium — the one place traditional gold/silver/bronze
// beats the brand palette for instant reading.
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

export function LeaderboardTable({ entries, currentUserId, metric }: LeaderboardTableProps) {
  const metricValue = (entry: LeaderboardEntry) =>
    metric === 'totalSales' ? formatNumber(entry.totalSales) : formatNumber(entry.totalPoints);
  const metricUnit = metric === 'totalPoints' ? 'pts' : entries.length === 1 ? 'sale' : 'sales';

  if (entries.length === 0) {
    return (
      <Card className="rounded-lg border-slate-200 bg-white p-10 text-center shadow-sm dark:border-border dark:bg-card">
        <Trophy className="mx-auto mb-3 size-10 text-slate-300 dark:text-muted-foreground" />
        <p className="font-medium text-slate-950 dark:text-foreground">The board is wide open</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
          First approved sale of the period takes #1.
        </p>
      </Card>
    );
  }

  const podium = entries.filter((e) => e.rank <= 3);
  const rest = entries.filter((e) => e.rank > 3);

  // Classic podium order on desktop: 2nd — 1st — 3rd, winner elevated.
  const podiumOrder: Record<number, string> = {
    1: 'sm:order-2 sm:-mt-3',
    2: 'sm:order-1 sm:mt-2',
    3: 'sm:order-3 sm:mt-2',
  };

  return (
    <div className="space-y-4">
      {/* Podium — no shame styling below; only the top three get theatre. */}
      {podium.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 sm:items-start">
          {podium.map((entry) => {
            const mine = entry.salesRepId === currentUserId;
            const m = medal[entry.rank];
            return (
              <Card
                key={entry.salesRepId}
                className={`rounded-lg border-slate-200 py-0 text-center shadow-sm dark:border-border dark:bg-card ${
                  podiumOrder[entry.rank]
                } ${entry.rank === 1 ? 'border-t-2 border-t-[#8dc63f]' : ''} ${
                  mine ? 'bg-[#8dc63f]/5 dark:bg-[#8dc63f]/10' : 'bg-white'
                }`}
              >
                <CardContent className="p-5">
                  <div
                    className={`mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#0A1F44]/8 text-sm font-bold text-[#0A1F44] ring-2 dark:bg-white/10 dark:text-white ${m.ring}`}
                  >
                    {initialsOf(entry.salesRepName)}
                  </div>
                  <div className="mt-2.5 flex items-center justify-center gap-1.5">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${m.chip}`}
                    >
                      {m.label}
                    </span>
                    {mine && (
                      <Badge className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#8dc63f]">You</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 truncate font-semibold text-slate-950 dark:text-foreground">
                    {entry.salesRepName}
                  </p>
                  <p className="portal-display portal-num mt-1 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-foreground">
                    {metricValue(entry)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-muted-foreground">
                    {metric === 'totalPoints'
                      ? `${entry.totalSales} approved ${entry.totalSales === 1 ? 'sale' : 'sales'}`
                      : `${formatNumber(entry.totalPoints)} pts`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Everyone else: clean neutral rows, own row highlighted. */}
      {rest.length > 0 && (
        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
          <CardContent className="px-0">
            <ul className="divide-y divide-slate-100 dark:divide-border">
              {rest.map((entry) => {
                const mine = entry.salesRepId === currentUserId;
                return (
                  <li
                    key={entry.salesRepId}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      mine ? 'bg-[#8dc63f]/8 dark:bg-[#8dc63f]/10' : ''
                    }`}
                  >
                    <span className="portal-num grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-muted dark:text-muted-foreground">
                      {entry.rank}
                    </span>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0A1F44]/8 text-[10px] font-semibold text-[#0A1F44] dark:bg-white/10 dark:text-white">
                      {initialsOf(entry.salesRepName)}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        mine
                          ? 'font-semibold text-slate-950 dark:text-foreground'
                          : 'text-slate-700 dark:text-muted-foreground'
                      }`}
                    >
                      {entry.salesRepName}
                      {mine && (
                        <Badge className="ml-2 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#8dc63f]">
                          You
                        </Badge>
                      )}
                    </span>
                    <span className="hidden text-xs text-slate-400 dark:text-muted-foreground sm:block">
                      {metric === 'totalPoints'
                        ? `${entry.totalSales} ${entry.totalSales === 1 ? 'sale' : 'sales'}`
                        : `${formatNumber(entry.totalPoints)} pts`}
                    </span>
                    <span className="portal-num text-sm font-semibold text-slate-950 dark:text-foreground">
                      {metricValue(entry)}
                      <span className="ml-1 text-xs font-normal text-slate-400">{metricUnit}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="px-1 text-xs text-slate-400 dark:text-muted-foreground">
        Rankings use approved sales for the selected period. Point values vary by product and
        plan.
      </p>
    </div>
  );
}
