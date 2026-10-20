'use client';

import { useState, useCallback, useRef } from 'react';
import { auth } from '@/lib/firebase/config';
import { useCacheSubject } from '@/lib/cache/useCacheSubject';
import {
  awaitPendingDataCacheRead,
  dataCacheGeneration,
  readDataCache,
  readDataCacheEntry,
  writeDataCache,
} from '@/lib/cache/dataCache';
import type { RecentSale, UnrankedRep } from '@/lib/leaderboard/team';
import type { PlanMixEntry } from '@/lib/sales/planMix';

interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
  movement?: number | null;
  spark?: (number | null)[];
  streakDays?: number;
  planMix?: PlanMixEntry[];
}

type Period = 'week' | 'month' | 'year' | 'all';
// The solar board's Set | Demoed | Closed: bookedConsults | solarDemoed | solarClosed.
type Metric = 'totalPoints' | 'totalSales' | 'bookedConsults' | 'solarDemoed' | 'solarClosed';
/** Which board: GET /api/portal/leaderboard (fiber) or /api/portal/solar/leaderboard. */
export type LeaderboardSource = 'fiber' | 'solar';

/** One board request: what fetchLeaderboard takes, minus `quiet`. */
export interface LeaderboardRequest {
  period?: Period;
  metric?: Metric;
  limit?: number;
  scope?: 'approved' | 'submitted';
  team?: boolean;
  month?: string | null;
  source?: LeaderboardSource;
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

export type CachedBoard = {
  leaderboard: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  unranked: UnrankedRep[];
  recent: RecentSale[];
  /** Undefined when the answer did not carry it (not the month board). */
  firstMonth?: string | null;
  /** How many reps are ranked in all (the dashboard's standing reads it). */
  totalRanked?: number;
};

const boardCacheKey = (query: string, source: LeaderboardSource = 'fiber') =>
  source === 'solar' ? `solar-leaderboard?${query}` : `leaderboard?${query}`;
/** The cache key of this board (the tab prefetch fills it too). */
export const leaderboardCacheKey = (request: LeaderboardRequest) =>
  boardCacheKey(leaderboardQuery(request), request.source);

const boardUrl = (query: string, source: LeaderboardSource = 'fiber') =>
  source === 'solar' ? `/api/portal/solar/leaderboard?${query}` : `/api/portal/leaderboard?${query}`;

/** The solar board as a phone first opens it (week, with the team). */
export const FIRST_SOLAR_BOARD = {
  period: 'week',
  metric: 'bookedConsults',
  limit: 100,
  scope: 'approved',
  team: true,
  source: 'solar',
} as const satisfies LeaderboardRequest;

type SolarRow = {
  rank?: unknown;
  uid?: unknown;
  name?: unknown;
  /** The fiber board's field names, accepted when a row carries them instead. */
  salesRepId?: unknown;
  salesRepName?: unknown;
  /** The board's count (consults, demos or closes); older answers carry `booked` only. */
  count?: unknown;
  booked?: unknown;
  mix?: unknown;
  movement?: unknown;
  spark?: unknown;
  streakDays?: unknown;
};

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** A solar row's rep id: `uid`, else the fiber board's `salesRepId`, else ''. */
const solarRowId = (row: { uid?: unknown; salesRepId?: unknown }) => str(row.uid) || str(row.salesRepId);

/**
 * Rows keyed by rep id, keeping the first of each id and dropping rows with
 * none. The board renders one element per row keyed on that id, so a missing
 * id used to become '' on every row and React warned about duplicate keys.
 */
function uniqueById<T extends { uid?: unknown; salesRepId?: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = row && typeof row === 'object' ? solarRowId(row) : '';
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** One solar row in the fiber board's shape: the count rides in totalSales and totalPoints. */
function solarEntry(row: SolarRow): LeaderboardEntry {
  const booked = num(row.count ?? row.booked);
  return {
    rank: num(row.rank),
    salesRepId: solarRowId(row),
    salesRepName: str(row.name) || str(row.salesRepName) || 'Unknown',
    totalSales: booked,
    totalPoints: booked,
    movement: typeof row.movement === 'number' ? row.movement : null,
    spark: Array.isArray(row.spark) ? (row.spark as (number | null)[]) : [],
    streakDays: num(row.streakDays),
    planMix: Array.isArray(row.mix) ? (row.mix as PlanMixEntry[]) : [],
  };
}

/** The cached board for a successful /api/portal/solar/leaderboard answer. */
export function solarBoardFromResponse(data: {
  leaderboard?: unknown;
  currentUser?: unknown;
  unranked?: unknown;
  recent?: unknown;
  firstMonth?: unknown;
  totalRanked?: unknown;
}): CachedBoard {
  const rows = uniqueById(Array.isArray(data.leaderboard) ? (data.leaderboard as SolarRow[]) : []);
  const unranked = uniqueById(
    Array.isArray(data.unranked)
      ? (data.unranked as { uid?: unknown; name?: unknown; salesRepId?: unknown; salesRepName?: unknown }[])
      : [],
  );
  return {
    ...(typeof data.totalRanked === 'number' ? { totalRanked: data.totalRanked } : {}),
    leaderboard: rows.map(solarEntry),
    currentUser: data.currentUser && typeof data.currentUser === 'object' ? solarEntry(data.currentUser as SolarRow) : null,
    unranked: unranked.map((rep) => ({
      salesRepId: solarRowId(rep),
      salesRepName: str(rep.name) || str(rep.salesRepName),
    })),
    recent: Array.isArray(data.recent) ? (data.recent as RecentSale[]) : [],
    firstMonth: 'firstMonth' in data ? (typeof data.firstMonth === 'string' ? data.firstMonth : null) : undefined,
  };
}

/**
 * The board the Leaderboard page opens on (week, points, with the team): the
 * page seeds and fetches it first, and the tab prefetch warms it.
 */
export const FIRST_LEADERBOARD_BOARD = {
  period: 'week',
  metric: 'totalPoints',
  limit: 100,
  scope: 'approved',
  team: true,
} as const satisfies LeaderboardRequest;

/** The cached board for a successful /api/portal/leaderboard answer. */
export function boardFromResponse(data: {
  leaderboard?: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  unranked?: unknown;
  recent?: unknown;
  firstMonth?: unknown;
  totalRanked?: unknown;
}): CachedBoard {
  return {
    ...(typeof data.totalRanked === 'number' ? { totalRanked: data.totalRanked } : {}),
    leaderboard: data.leaderboard ?? [],
    currentUser: data.currentUser ?? null,
    unranked: Array.isArray(data.unranked) ? (data.unranked as UnrankedRep[]) : [],
    recent: Array.isArray(data.recent) ? (data.recent as RecentSale[]) : [],
    firstMonth: 'firstMonth' in data ? (typeof data.firstMonth === 'string' ? data.firstMonth : null) : undefined,
  };
}

/**
 * `seed` names the board the caller fetches first: its last copy (if any)
 * shows on the first paint and the fetch refreshes it in the background.
 */
export function useLeaderboard(seed?: LeaderboardRequest) {
  const uid = useCacheSubject();
  const [seeded] = useState(() => (seed ? readDataCache<CachedBoard>(uid, boardCacheKey(leaderboardQuery(seed), seed.source)) : undefined));
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
    options: { team?: boolean; quiet?: boolean; month?: string | null; source?: LeaderboardSource } = {}
  ) => {
    const request = ++latest.current;
    const gen = dataCacheGeneration();
    const source = options.source ?? 'fiber';
    const query = leaderboardQuery({ period, metric, limit, scope, team: options.team, month: options.month });
    const key = boardCacheKey(query, source);
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
      // The tab prefetch is already reading this board: use its answer.
      const prefetched = cached ? undefined : await awaitPendingDataCacheRead<CachedBoard>(uid, key);
      if (prefetched) {
        if (request !== latest.current) return;
        const board = prefetched.value;
        setLeaderboard(board.leaderboard);
        setCurrentUser(board.currentUser);
        setUnranked(board.unranked);
        setRecent(board.recent);
        if (board.firstMonth !== undefined) setFirstMonth(board.firstMonth);
        shownAt.current = prefetched.at;
        setStaleAt(null);
        setError(null);
        setLoading(false);
        return;
      }
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(boardUrl(query, source), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }
      const board = source === 'solar' ? solarBoardFromResponse(data) : boardFromResponse(data);
      writeDataCache<CachedBoard>(uid, key, board, gen);
      if (request !== latest.current) return;

      setLeaderboard(board.leaderboard);
      setCurrentUser(board.currentUser);
      setUnranked(board.unranked);
      setRecent(board.recent);
      if (board.firstMonth !== undefined) setFirstMonth(board.firstMonth);
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
        // This board never loaded: drop the previous board so its ranking is
        // not shown under the new period's or metric's labels.
        setLeaderboard([]);
        setCurrentUser(null);
        setUnranked([]);
        setRecent([]);
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
