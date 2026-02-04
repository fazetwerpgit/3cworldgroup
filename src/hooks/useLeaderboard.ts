'use client';

import { useState, useCallback } from 'react';

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

      const response = await fetch(`/api/portal/leaderboard?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }

      setLeaderboard(data.leaderboard);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch leaderboard';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getUserRank = useCallback((userId: string): LeaderboardEntry | null => {
    const entry = leaderboard.find((e) => e.salesRepId === userId);
    return entry || null;
  }, [leaderboard]);

  return {
    leaderboard,
    loading,
    error,
    fetchLeaderboard,
    getUserRank,
  };
}
