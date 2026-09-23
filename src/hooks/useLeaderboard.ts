'use client';

import { useState, useCallback } from 'react';
import { auth } from '@/lib/firebase/config';
import type { RecentSale, UnrankedRep } from '@/lib/leaderboard/team';

interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
  movement?: number | null;
  spark?: (number | null)[];
  streakDays?: number;
}

type Period = 'week' | 'month' | 'year' | 'all';
type Metric = 'totalPoints' | 'totalSales';

export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  // The caller's own standing from the server — correct even when they rank
  // below the returned top-N.
  const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(null);
  // ?include=team extras for the leaderboard page: the team at 0 and the
  // newest sales (name, plan, time). Empty unless the caller opts in.
  const [unranked, setUnranked] = useState<UnrankedRep[]>([]);
  const [recent, setRecent] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (
    period: Period = 'month',
    metric: Metric = 'totalPoints',
    limit: number = 10,
    scope: 'approved' | 'submitted' = 'approved',
    options: { team?: boolean } = {}
  ) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('period', period);
      params.append('metric', metric);
      params.append('limit', limit.toString());
      if (scope === 'submitted') params.append('scope', scope);
      if (options.team) params.append('include', 'team');

      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(`/api/portal/leaderboard?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }

      setLeaderboard(data.leaderboard);
      setCurrentUser(data.currentUser ?? null);
      setUnranked(Array.isArray(data.unranked) ? data.unranked : []);
      setRecent(Array.isArray(data.recent) ? data.recent : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch leaderboard';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getUserRank = useCallback((userId: string): LeaderboardEntry | null => {
    // Prefer the server-computed standing; fall back to scanning the visible list.
    if (currentUser && currentUser.salesRepId === userId) return currentUser;
    return leaderboard.find((e) => e.salesRepId === userId) ?? null;
  }, [leaderboard, currentUser]);

  return {
    leaderboard,
    currentUser,
    unranked,
    recent,
    loading,
    error,
    fetchLeaderboard,
    getUserRank,
  };
}
