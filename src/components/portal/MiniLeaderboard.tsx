'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Trophy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Entry {
  salesRepId: string;
  salesRepName: string;
  rank: number;
  totalPoints: number;
}

/**
 * Dashboard rail: this month's top five plus your own standing, so a rep sees
 * exactly where they sit without leaving the dashboard.
 */
export function MiniLeaderboard() {
  const { user, hasPermission } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [me, setMe] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBoard() {
      if (!user) return;
      try {
        const token = await auth?.currentUser?.getIdToken();
        const res = await fetch(
          '/api/portal/leaderboard?period=month&metric=totalPoints&limit=5',
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        if (res.ok) {
          const data = await res.json();
          setEntries(data.leaderboard ?? []);
          setMe(data.currentUser ?? null);
        }
      } catch (error) {
        console.error('Error fetching mini leaderboard:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchBoard();
  }, [user]);

  if (!hasPermission('leaderboard:read')) return null;

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

  const rankChip = (rank: number, mine: boolean) => (
    <span
      className={`portal-num grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-semibold ${
        rank === 1
          ? 'bg-[#8dc63f] text-[#0A1F44]'
          : rank <= 3
            ? 'bg-[#8dc63f]/15 text-[#3f6212] dark:bg-[#8dc63f]/20 dark:text-[#d7ecc0]'
            : mine
              ? 'bg-[#0A1F44]/10 text-[#0A1F44] dark:bg-white/10 dark:text-white'
              : 'bg-slate-100 text-slate-500 dark:bg-muted dark:text-muted-foreground'
      }`}
    >
      {rank}
    </span>
  );

  const row = (entry: Entry) => {
    const mine = entry.salesRepId === user?.uid;
    return (
      <li
        key={entry.salesRepId}
        className={`flex items-center gap-3 px-4 py-2.5 ${
          mine ? 'bg-[#8dc63f]/8 dark:bg-[#8dc63f]/10' : ''
        }`}
      >
        {rankChip(entry.rank, mine)}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            mine
              ? 'font-semibold text-slate-950 dark:text-foreground'
              : 'text-slate-700 dark:text-muted-foreground'
          }`}
        >
          {mine ? 'You' : entry.salesRepName}
        </span>
        <span className="portal-num text-sm font-medium text-slate-950 dark:text-foreground">
          {formatNumber(entry.totalPoints)}
        </span>
      </li>
    );
  };

  const meInTop = me && entries.some((e) => e.salesRepId === me.salesRepId);

  return (
    <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
      <CardHeader className="border-b border-slate-100 !py-3 dark:border-border">
        <CardTitle className="flex items-center justify-between text-base text-slate-950 dark:text-foreground">
          <span className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#5a8f1f]" />
            Leaderboard
          </span>
          <Link
            href="/portal/leaderboard"
            className="flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-[#5a8f1f] dark:text-muted-foreground"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {loading ? (
          <ul>
            {[...Array(5)].map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-10" />
              </li>
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
            No points on the board yet this month — first sale takes #1.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-border">
            {entries.map(row)}
            {me && !meInTop && (
              <>
                <li aria-hidden="true" className="px-4 py-1 text-center text-xs text-slate-400">
                  ⋯
                </li>
                {row(me)}
              </>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
