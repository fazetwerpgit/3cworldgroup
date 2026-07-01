'use client';

import { useState, useCallback } from 'react';
import { auth } from '@/lib/firebase/config';

interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
}

type Period = 'week' | 'month' | 'year' | 'all';
type Metric = 'totalPoints' | 'totalSales';

export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  // The caller's own standing from the server — correct even when they rank
  // below the returned top-N.
  const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (
    period: Period = 'month',
    metric: Metric = 'totalPoints',
    limit: number = 10
  ) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('period', period);
      params.append('metric', metric);
      params.append('limit', limit.toString());

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
    loading,
    error,
    fetchLeaderboard,
    getUserRank,
  };
}
