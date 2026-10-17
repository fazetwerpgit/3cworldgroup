'use client';

import { useState, useCallback, useRef } from 'react';
import { auth } from '@/lib/firebase/config';
import { useCacheSubject } from '@/lib/cache/useCacheSubject';
import { dataCacheGeneration, readDataCache, readDataCacheEntry, writeDataCache } from '@/lib/cache/dataCache';
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

/** One board request: what fetchLeaderboard takes, minus `quiet`. */
export interface LeaderboardRequest {
  period?: Period;
  metric?: Metric;
  limit?: number;
  scope?: 'approved' | 'submitted';
  team?: boolean;
  month?: string | null;
}

/** The board's query string, which is also its cache key. */
export function leaderboardQuery({
  period = 'month',
  metric = 'totalPoints',
  limit = 10,
  scope = 'approved',
  team,
  month,
}: LeaderboardRequest): string {
  const params = new URLSearchParams();
  params.append('period', period);
  params.append('metric', metric);
  params.append('limit', limit.toString());
  if (scope === 'submitted') params.append('scope', scope);
  if (team) params.append('include', 'team');
  if (period === 'month' && month) params.append('month', month);
  return params.toString();
}

type CachedBoard = {
  leaderboard: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  unranked: UnrankedRep[];
  recent: RecentSale[];
  /** Undefined when the answer did not carry it (not the month board). */
  firstMonth?: string | null;
};

const boardCacheKey = (query: string) => `leaderboard?${query}`;

/**
 * `seed` names the board the caller fetches first: its last copy (if any)
 * shows on the first paint and the fetch refreshes it in the background.
 */
export function useLeaderboard(seed?: LeaderboardRequest) {
  const uid = useCacheSubject();
  const [seeded] = useState(() => (seed ? readDataCache<CachedBoard>(uid, boardCacheKey(leaderboardQuery(seed))) : undefined));
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => seeded?.leaderboard ?? []);
  // The caller's own standing from the server — correct even when they rank
  // below the returned top-N.
  const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(() => seeded?.currentUser ?? null);
  // ?include=team extras for the leaderboard page: the team at 0 and the
  // newest sales (name, plan, time). Empty unless the caller opts in.
  const [unranked, setUnranked] = useState<UnrankedRep[]>(() => seeded?.unranked ?? []);
  const [recent, setRecent] = useState<RecentSale[]>(() => seeded?.recent ?? []);
  // Month view only: the earliest month with a sale on the board (YYYY-MM),
  // so a month picker knows how far back it can go. Null until known.
  const [firstMonth, setFirstMonth] = useState<string | null>(() => seeded?.firstMonth ?? null);
  // A seeded board with no copy yet starts on its skeleton, not an empty board.
  const [loading, setLoading] = useState(() => !!seed && !seeded);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may land: a slow answer for the old period (or a
  // resume refresh overtaken by a filter tap) must not replace the new board.
  const latest = useRef(0);
  // When the board on screen was loaded, and (after a quiet refresh failed
  // with it still showing) that time, for the "Couldn't refresh · as of" note.
  const shownAt = useRef<number | null>(null);
  const [staleAt, setStaleAt] = useState<number | null>(null);

  /**
   * `quiet` reloads the board in place (the app was reopened): no loading
   * flag, so no skeleton, and a failure keeps the board on screen.
   * `month` (YYYY-MM) reads a past month on the month board; omit it for this
   * month.
   */
  const fetchLeaderboard = useCallback(async (
    period: Period = 'month',
    metric: Metric = 'totalPoints',
    limit: number = 10,
    scope: 'approved' | 'submitted' = 'approved',
    options: { team?: boolean; quiet?: boolean; month?: string | null } = {}
  ) => {
    const request = ++latest.current;
    const gen = dataCacheGeneration();
    const query = leaderboardQuery({ period, metric, limit, scope, team: options.team, month: options.month });
    const key = boardCacheKey(query);
    // Seen before: show that board now and refresh it in place (like `quiet`).
    const entry = readDataCacheEntry<CachedBoard>(uid, key);
    const cached = entry?.value;
    if (cached) {
      shownAt.current = entry.at;
      setStaleAt(null);
      setLeaderboard(cached.leaderboard);
      setCurrentUser(cached.currentUser);
      setUnranked(cached.unranked);
      setRecent(cached.recent);
      if (cached.firstMonth !== undefined) setFirstMonth(cached.firstMonth);
      setLoading(false);
      setError(null);
    } else if (!options.quiet) {
      shownAt.current = null;
      setStaleAt(null);
      setLoading(true);
      setError(null);
    }
    const quiet = options.quiet || !!cached;
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(`/api/portal/leaderboard?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }
      writeDataCache<CachedBoard>(uid, key, {
        leaderboard: data.leaderboard,
        currentUser: data.currentUser ?? null,
        unranked: Array.isArray(data.unranked) ? data.unranked : [],
        recent: Array.isArray(data.recent) ? data.recent : [],
        firstMonth: 'firstMonth' in data ? (typeof data.firstMonth === 'string' ? data.firstMonth : null) : undefined,
      }, gen);
      if (request !== latest.current) return;

      setLeaderboard(data.leaderboard);
      setCurrentUser(data.currentUser ?? null);
      setUnranked(Array.isArray(data.unranked) ? data.unranked : []);
      setRecent(Array.isArray(data.recent) ? data.recent : []);
      if ('firstMonth' in data) setFirstMonth(typeof data.firstMonth === 'string' ? data.firstMonth : null);
      shownAt.current = Date.now();
      setStaleAt(null);
      setError(null);
    } catch (err) {
      if (request !== latest.current) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch leaderboard';
      if (quiet) {
        console.error('Quiet leaderboard refresh failed:', message);
        if (shownAt.current !== null) setStaleAt(shownAt.current);
      } else {
        setError(message);
      }
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [uid]);

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
    firstMonth,
    loading,
    error,
    staleAt,
    fetchLeaderboard,
    getUserRank,
  };
}
