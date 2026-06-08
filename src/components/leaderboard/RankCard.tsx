'use client';

import { Award, BarChart3, CheckCircle2, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface RankCardProps {
  rank: number | null;
  totalSales: number;
  totalPoints: number;
}

export function RankCard({ rank, totalSales, totalPoints }: RankCardProps) {
  const formatPoints = (points: number) => new Intl.NumberFormat('en-US').format(points);

  const rankLabel = rank ? `#${rank}` : '--';
  const rankStatus = rank ? (rank <= 10 ? `Top ${rank}` : 'Ranked') : 'Not ranked';

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_2fr] lg:items-center">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Your Standing</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className={`text-4xl font-semibold tracking-normal ${rank ? 'text-[#0A1F44]' : 'text-slate-400'}`}>{rankLabel}</span>
                  <Badge variant="outline" className="mb-1 border-slate-200 bg-white text-slate-600">
                    {rankStatus}
                  </Badge>
                </div>
              </div>
              <div className="flex size-12 items-center justify-center rounded-lg bg-[#8dc63f]/10 text-[#5f8f20]">
                <Trophy className="size-6" />
              </div>
            </div>
            <p className="mt-4 text-sm leading-5 text-slate-600">
              Current rank is calculated from approved leaderboard data for the active reporting period.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[#8dc63f]/10 text-[#5f8f20]">
                  <Award className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Points</p>
                  <p className={`mt-1 text-3xl font-semibold tracking-normal ${totalPoints > 0 ? 'text-[#0A1F44]' : 'text-slate-400'}`}>
                    {formatPoints(totalPoints)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <BarChart3 className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Approved Sales</p>
                  <p className={`mt-1 text-3xl font-semibold tracking-normal ${totalSales > 0 ? 'text-[#0A1F44]' : 'text-slate-400'}`}>
                    {totalSales}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!rank && totalSales === 0 && (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <span>Submit an approved sale to appear in the leaderboard data.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
