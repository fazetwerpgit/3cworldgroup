'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { dataCacheGeneration, readDataCacheEntry, writeDataCache } from '@/lib/cache/dataCache';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import type { CarrierReportStamp } from '@/lib/fiberReport/reportFreshness';
import type { DashboardCall, LeaderboardRow } from '@/lib/dashboard/repSummary';
import type { CompPlanCompanyRates, CompPlanResponse, FiberOrder, FiberStatusResponse, Sale } from '@/types';
import { salesListCacheKey } from '@/hooks/useSales';
import { FIBER_CACHE_KEY } from '@/hooks/useFiberStatus';
import { COMP_PLAN_CACHE_KEY, compPlanState } from '@/hooks/useCompPlan';

// The D dashboard's data, one independent section per source. Every section
// loads in parallel (Promise.allSettled) and renders as it lands, so a slow or
// failed source never holds up — or zeroes out — the others. A failed section
// reports 'error' and can be retried on its own. Reopening the app reloads
// every section quietly (useRefreshOnResume): the numbers on screen stay put
// until the new ones land.
//
// Always the caller's OWN numbers: sales are fetched with salesRepId = uid for
// every role (admins and owners included), the comp plan is read for the
// caller's own slice only (never `rates` of scope 'all', never `margin`), and
// nothing here requests a company-wide total.

export type Section<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error' };

export interface RepBook {
  /** Own sales, newest logged first, with the carrier's install dates applied. */
  sales: Sale[];
  fiberBySale: Map<string, FiberOrder>;
  /**
   * The carrier report failed to load. The book still stands, but carrier
   * cancellations and missed installs are unknown, so the estimates may be off
   * and the dashboard says so instead of passing them off as complete.
   */
  carrierFailed: boolean;
  /**
   * When the last carrier report landed and the day it covers, for the rep's
   * own book only (null for management, or when the report failed to load).
   */
  report?: CarrierReportStamp | null;
  /**
   * The day the newest carrier report covers, for any viewer. An install day
   * after it is "waiting on carrier", never overdue (carrierReportCovers).
   */
  reportAsOf?: string | null;
}

export interface RepStanding {
  entries: LeaderboardRow[];
  me: LeaderboardRow | null;
  totalRanked: number;
}

export interface RepChallenge {
  target: number;
  done: number;
}

export interface RepDashboardState {
  book: Section<RepBook>;
  /** Own comp-plan slice; `rates: null` = no pay plan assigned. */
  plan: Section<{ rates: CompPlanCompanyRates | null }>;
  standing: Section<RepStanding>;
  challenge: Section<RepChallenge>;
  calls: Section<DashboardCall[]>;
  /** Onboarding documents the rep still has to sign (0 once all are signed). */
  paperwork: Section<number>;
}

export type RepSectionKey = Exclude<keyof RepDashboardState, never>;

const LOADING = { status: 'loading' } as const;

/** Cache key for the dashboard's sections (a sale write drops it: see useSales). */
const DASHBOARD_CACHE_KEY = 'dashboard';

async function getJson<T>(url: string, token: string | null, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || data === null) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

/**
 * The rep's own sales plus the carrier report. Only the sales are required:
 * without the report the book still stands (as the Sales page does), flagged
 * `carrierFailed` so the page can say the estimates may be off.
 */
export async function fetchRepBook(
  uid: string,
  token: string | null,
  signal: AbortSignal,
  /** Handed the raw answers (the same requests the Sales tab makes), to seed its cache. */
  onRaw?: (sales: { sales: Sale[]; truncated?: boolean }, fiber: FiberStatusResponse | null) => void
): Promise<RepBook> {
  const own = encodeURIComponent(uid);
  const [salesResult, fiberResult] = await Promise.allSettled([
    getJson<{ sales: Sale[]; truncated?: boolean }>(`/api/portal/sales?salesRepId=${own}&limit=500`, token, signal),
    getJson<{
      scope?: 'own' | 'all';
      orders?: FiberOrder[];
      lastReportAt?: string | null;
      lastReportAsOf?: string | null;
    }>('/api/portal/sales/status', token, signal),
  ]);
  if (salesResult.status === 'rejected') throw salesResult.reason;
  if (onRaw && !signal.aborted) {
    onRaw(salesResult.value, fiberResult.status === 'fulfilled' ? (fiberResult.value as FiberStatusResponse) : null);
  }
  const logged = salesResult.value.sales ?? [];
  const carrierFailed = fiberResult.status === 'rejected';
  if (carrierFailed && !signal.aborted) console.error('Carrier report failed:', fiberResult.reason);
  const orders = fiberResult.status === 'fulfilled' ? fiberResult.value.orders ?? [] : [];
  const fiberBySale = matchFiberOrdersToSales(logged, orders);
  const fiber = fiberResult.status === 'fulfilled' ? fiberResult.value : null;
  const report =
    fiber && fiber.scope === 'own'
      ? { lastReportAt: fiber.lastReportAt ?? null, lastReportAsOf: fiber.lastReportAsOf ?? null }
      : null;
  const reportAsOf = typeof fiber?.lastReportAsOf === 'string' ? fiber.lastReportAsOf : null;
  return { sales: applyCarrierInstallDates(logged, fiberBySale), fiberBySale, carrierFailed, report, reportAsOf };
}

/**
 * The book with one sale's install date set, as the save returned it. Shown at
 * once so est. pay, the payout window and the buckets move the moment the rep
 * saves; the quiet refresh after it brings the server's copy.
 */
export function withSaleInstallDate(book: RepBook, saleId: string, installDate: string): RepBook {
  return {
    ...book,
    sales: book.sales.map((sale) => (sale.id === saleId ? { ...sale, installDate: new Date(installDate) } : sale)),
  };
}

type Loaders = { [K in RepSectionKey]: (token: string | null, signal: AbortSignal) => Promise<unknown> };

export function useRepDashboard() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const active = user?.status === 'active';

  // Revisit: the sections loaded last time show at once (from the in-memory,
  // per-account cache) and refresh quietly underneath.
  const [cachedEntry] = useState(() => readDataCacheEntry<Partial<RepDashboardState>>(uid, DASHBOARD_CACHE_KEY));
  const cached = cachedEntry?.value;
  // Writes from this mount never land in another account's cache.
  const [gen] = useState(dataCacheGeneration);
  // When the numbers on screen were last loaded in full, and — after a
  // background refresh failed with them still showing — that time, for the
  // quiet "Couldn't refresh · as of" note.
  const lastGoodAt = useRef<number | null>(cachedEntry?.at ?? null);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [initialState] = useState<RepDashboardState>(() => ({
    book: LOADING,
    plan: LOADING,
    standing: LOADING,
    challenge: LOADING,
    calls: LOADING,
    paperwork: LOADING,
    ...cached,
  }));
  const [state, setState] = useState<RepDashboardState>(initialState);
  // When each section on screen last came from the server. A cached section
  // starts at the entry's time; each moves only when its own fetch succeeds,
  // so writing the sections back (or a local install-date edit) never makes
  // the entry look fresher.
  const sectionFetchedAt = useRef(
    new Map<RepSectionKey, number>(
      cached && cachedEntry
        ? (Object.keys(cached) as RepSectionKey[]).map((key) => [key, cachedEntry.at] as [RepSectionKey, number])
        : []
    )
  );

  // Keep the cache in step with every section that is on screen. The seeded
  // state is what the cache already holds: writing it back would only restamp it.
  useEffect(() => {
    if (state === initialState) return;
    const ready: Partial<RepDashboardState> = {};
    for (const key of Object.keys(state) as RepSectionKey[]) {
      if (state[key].status === 'ready') (ready as Record<string, unknown>)[key] = state[key];
    }
    const keys = Object.keys(ready) as RepSectionKey[];
    if (keys.length) {
      // The entry is as old as its oldest section: a section kept from an older
      // copy after its refresh failed holds the time back, so the next visit
      // still shows its "as of" note.
      const now = Date.now();
      const at = Math.min(...keys.map((key) => sectionFetchedAt.current.get(key) ?? now));
      writeDataCache(uid, DASHBOARD_CACHE_KEY, ready, gen, at);
    }
  }, [state, initialState, uid, gen]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const controllers = useRef(new Map<RepSectionKey, AbortController>());
  // Sections still showing an older copy after their refresh failed: the
  // "as of" note stays until every one of them has reloaded.
  const staleKeys = useRef(new Set<RepSectionKey>());

  const loaders = useCallback((): Partial<Loaders> => {
    if (!uid) return {};
    const loaders: Partial<Loaders> = {
      // The carrier report sharpens install dates and drops carrier
      // cancellations; see fetchRepBook for what happens without it.
      // The dashboard reads exactly what the Sales tab reads for a rep's own
      // book (the list and the carrier report): seed that tab's cache with it,
      // so opening Sales next paints at once without asking again.
      book: (token, signal) =>
        fetchRepBook(uid, token, signal, (sales, fiber) => {
          writeDataCache(uid, salesListCacheKey({ limit: 500, salesRepId: uid }), { sales: sales.sales ?? [], truncated: sales.truncated === true }, gen);
          if (fiber) writeDataCache(uid, FIBER_CACHE_KEY, fiber, gen);
        }),
      plan: async (token, signal) => {
        // Pending accounts are refused by the route; they have no plan yet.
        if (!active) return { rates: null };
        const data = await getJson<CompPlanResponse>('/api/portal/comp-plan', token, signal);
        // Same answer the Sales tab's pay view reads: seed it.
        if (!signal.aborted) writeDataCache(uid, COMP_PLAN_CACHE_KEY, compPlanState(uid, data), gen);
        const rates =
          data.scope === 'all'
            ? ((data.ownRates as CompPlanCompanyRates | null) ?? null)
            : ((data.rates as CompPlanCompanyRates | null) ?? null);
        return { rates };
      },
      standing: async (token, signal) => {
        const data = await getJson<{ leaderboard?: LeaderboardRow[]; currentUser?: LeaderboardRow | null; totalRanked?: number }>(
          '/api/portal/leaderboard?period=week&metric=totalPoints&limit=100',
          token,
          signal
        );
        return {
          entries: data.leaderboard ?? [],
          me: data.currentUser ?? null,
          totalRanked: data.totalRanked ?? 0,
        } satisfies RepStanding;
      },
      challenge: async (token, signal) => {
        const [setting, week] = await Promise.all([
          // A failed read errors the card ("Couldn't load · Retry"); never a made-up target.
          getJson<{ targetSales?: number }>('/api/portal/settings/weekly-challenge', token, signal),
          // 'submitted' counts sales as they are logged (the Leaderboard page's challenge).
          getJson<{ currentUser?: LeaderboardRow | null }>(
            '/api/portal/leaderboard?period=week&metric=totalSales&limit=1&scope=submitted',
            token,
            signal
          ),
        ]);
        if (typeof setting.targetSales !== 'number') throw new Error('Weekly challenge target missing');
        return { target: setting.targetSales, done: week.currentUser?.totalSales ?? 0 } satisfies RepChallenge;
      },
      calls: async (token, signal) => {
        const data = await getJson<{ calls?: DashboardCall[] }>('/api/portal/calls', token, signal);
        return data.calls ?? [];
      },
      // For an active rep the checklist route returns only unsigned documents.
      paperwork: async (token, signal) => {
        const data = await getJson<{ items?: unknown[] }>(
          `/api/portal/onboarding?userId=${encodeURIComponent(uid)}`,
          token,
          signal
        );
        return data.items?.length ?? 0;
      },
    };
    return loaders;
  }, [active, uid, gen]);

  const run = useCallback(
    /** Resolves true when every requested section loaded. */
    async (keys?: RepSectionKey[], { quiet = false }: { quiet?: boolean } = {}): Promise<boolean> => {
      const all = loaders();
      const wanted = (keys ?? (Object.keys(all) as RepSectionKey[])).filter((key) => all[key]);
      if (!wanted.length) return true;

      const token = await getIdToken().catch(() => null);
      let keptStale = false;
      let failed = false;

      return Promise.allSettled(
        wanted.map(async (key) => {
          controllers.current.get(key)?.abort();
          const controller = new AbortController();
          controllers.current.set(key, controller);
          try {
            const data = await all[key]!(token, controller.signal);
            if (controller.signal.aborted) return;
            sectionFetchedAt.current.set(key, Date.now());
            staleKeys.current.delete(key);
            setState((current) => ({ ...current, [key]: { status: 'ready', data } }));
          } catch (error) {
            // Only a real abort (unmount / superseded retry) is silent. A plain
            // network failure must surface as "Couldn't load", never spin forever.
            if (controller.signal.aborted) return;
            console.error(`Dashboard section "${key}" failed:`, error);
            failed = true;
            if (quiet && stateRef.current[key]?.status === 'ready') {
              keptStale = true;
              staleKeys.current.add(key);
            }
            // A quiet refresh keeps what is on screen rather than trading it for
            // an error; a section with nothing loaded yet still gets its error.
            setState((current) =>
              quiet && current[key]?.status === 'ready' ? current : { ...current, [key]: { status: 'error' } }
            );
          }
        })
      ).then(() => {
        if (keptStale) {
          setStaleAt(lastGoodAt.current ?? Date.now());
        } else if (!failed && !keys) {
          lastGoodAt.current = Date.now();
          setStaleAt(null);
        } else if (staleKeys.current.size === 0) {
          setStaleAt(null);
        }
        return !failed;
      });
    },
    [loaders]
  );

  const showedCached = useRef(!!cached);
  useEffect(() => {
    const running = controllers.current;
    // From cache: a quiet refresh keeps each section on screen if its reload fails.
    const quiet = showedCached.current;
    showedCached.current = false;
    void run(undefined, { quiet });
    return () => {
      for (const controller of running.values()) controller.abort();
      running.clear();
    };
  }, [run]);

  const retry = useCallback(
    (key: RepSectionKey) => {
      setState((current) => ({ ...current, [key]: LOADING }));
      // Back online: the sections kept from an older copy reload too, so the
      // "Couldn't refresh · as of" note clears once they land.
      void run([key]).then((ok) => {
        const stale = [...staleKeys.current];
        if (ok && stale.length) void run(stale, { quiet: true });
      });
    },
    [run]
  );

  /** The rep saved a new install date: show it now, then refresh the book quietly. */
  const installDateSaved = useCallback(
    (saleId: string, installDate: string) => {
      setState((current) =>
        current.book.status === 'ready'
          ? { ...current, book: { status: 'ready', data: withSaleInstallDate(current.book.data, saleId, installDate) } }
          : current
      );
      void run(['book'], { quiet: true });
    },
    [run]
  );

  /** Reopened after a while: reload every section without leaving the screen. */
  // Returns the run, so pull to refresh can wait for it.
  const refresh = useCallback(() => run(undefined, { quiet: true }), [run]);
  useRefreshOnResume(refresh, { enabled: !!uid });

  return { ...state, staleAt, retry, installDateSaved };
}
