'use client';

import { BarChart3, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

export function LeaderboardTable({ entries, currentUserId, metric }: LeaderboardTableProps) {
  const formatPoints = (points: number) => new Intl.NumberFormat('en-US').format(points);

  const getMetricValue = (entry: LeaderboardEntry) => {
    switch (metric) {
      case 'totalSales':
        return entry.totalSales.toString();
      case 'totalPoints':
      default:
        return formatPoints(entry.totalPoints);
    }
  };

  const getRankTone = (rank: number) => {
    if (rank === 1) return 'border-amber-200 bg-amber-50 text-amber-700';
    if (rank === 2) return 'border-slate-300 bg-slate-100 text-slate-700';
    if (rank === 3) return 'border-orange-200 bg-orange-50 text-orange-700';
    return 'border-slate-200 bg-white text-slate-600';
  };

  if (entries.length === 0) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="px-5 py-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <BarChart3 className="size-6" />
          </div>
          <p className="mt-4 font-semibold text-[#0A1F44]">No rankings yet</p>
          <p className="mt-2 text-sm text-slate-500">Approved sales will appear here once leaderboard data is available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base text-[#0A1F44]">Team Rankings</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Sorted by {metric === 'totalPoints' ? 'approved points' : 'approved sales'}.</p>
          </div>
          <Badge variant="outline" className="gap-2 border-slate-200 bg-slate-50 text-slate-600">
            <Trophy className="size-3.5" />
            Top {entries.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="w-24 px-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Rank</TableHead>
              <TableHead className="min-w-56 text-xs font-semibold uppercase tracking-wide text-slate-500">Representative</TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                {metric === 'totalPoints' ? 'Points' : 'Sales'}
              </TableHead>
              <TableHead className="hidden text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">Approved Sales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const isCurrentUser = entry.salesRepId === currentUserId;
              const initials = entry.salesRepName
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((name) => name.charAt(0).toUpperCase())
                .join('');

              return (
                <TableRow key={entry.salesRepId} className={isCurrentUser ? 'bg-[#8dc63f]/10 hover:bg-[#8dc63f]/15' : undefined}>
                  <TableCell className="px-5">
                    <Badge variant="outline" className={`min-w-12 justify-center rounded-md ${getRankTone(entry.rank)}`}>
                      #{entry.rank}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                        {initials || entry.salesRepName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`truncate font-medium ${isCurrentUser ? 'text-[#5f8f20]' : 'text-[#0A1F44]'}`}>{entry.salesRepName}</p>
                          {isCurrentUser && (
                            <Badge className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#8dc63f]">You</Badge>
                          )}
                        </div>
                        {entry.rank <= 3 && <p className="mt-0.5 text-xs text-slate-500">Top three for this period</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold text-[#0A1F44]">{getMetricValue(entry)}</span>
                    {metric === 'totalPoints' && <span className="ml-1 text-xs text-slate-500">pts</span>}
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
                      {entry.totalSales} {entry.totalSales === 1 ? 'sale' : 'sales'}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
