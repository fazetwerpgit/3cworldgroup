'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import type { DashboardCall, LeaderboardRow } from '@/lib/dashboard/repSummary';
import type { CompPlanCompanyRates, CompPlanResponse, FiberOrder, Sale } from '@/types';

// The D dashboard's data, one independent section per source. Every section
// loads in parallel (Promise.allSettled) and renders as it lands, so a slow or
// failed source never holds up — or zeroes out — the others. A failed section
// reports 'error' and can be retried on its own.
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
  /** Open leads requests (platform roles only; null when not asked for). */
  leads: Section<number> | null;
}

export type RepSectionKey = Exclude<keyof RepDashboardState, never>;

const LOADING = { status: 'loading' } as const;

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
export async function fetchRepBook(uid: string, token: string | null, signal: AbortSignal): Promise<RepBook> {
  const own = encodeURIComponent(uid);
  const [salesResult, fiberResult] = await Promise.allSettled([
    getJson<{ sales: Sale[] }>(`/api/portal/sales?salesRepId=${own}&limit=500`, token, signal),
    getJson<{ orders?: FiberOrder[] }>('/api/portal/sales/status', token, signal),
  ]);
  if (salesResult.status === 'rejected') throw salesResult.reason;
  const logged = salesResult.value.sales ?? [];
  const carrierFailed = fiberResult.status === 'rejected';
  if (carrierFailed && !signal.aborted) console.error('Carrier report failed:', fiberResult.reason);
  const orders = fiberResult.status === 'fulfilled' ? fiberResult.value.orders ?? [] : [];
  const fiberBySale = matchFiberOrdersToSales(logged, orders);
  return { sales: applyCarrierInstallDates(logged, fiberBySale), fiberBySale, carrierFailed };
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

export function useRepDashboard({ withLeads = false }: { withLeads?: boolean } = {}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const active = user?.status === 'active';

  const [state, setState] = useState<RepDashboardState>(() => ({
    book: LOADING,
    plan: LOADING,
    standing: LOADING,
    challenge: LOADING,
    calls: LOADING,
    leads: withLeads ? LOADING : null,
  }));
  const controllers = useRef(new Map<RepSectionKey, AbortController>());

  const loaders = useCallback((): Partial<Loaders> => {
    if (!uid) return {};
    const loaders: Partial<Loaders> = {
      // The carrier report sharpens install dates and drops carrier
      // cancellations; see fetchRepBook for what happens without it.
      book: (token, signal) => fetchRepBook(uid, token, signal),
      plan: async (token, signal) => {
        // Pending accounts are refused by the route; they have no plan yet.
        if (!active) return { rates: null };
        const data = await getJson<CompPlanResponse>('/api/portal/comp-plan', token, signal);
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
    };
    if (withLeads) {
      loaders.leads = async (token, signal) => {
        const data = await getJson<{ submissions?: Array<{ status?: string }> }>(
          '/api/portal/forms/leads-request/review',
          token,
          signal
        );
        return (data.submissions ?? []).filter((row) => row.status !== 'handled').length;
      };
    }
    return loaders;
  }, [active, uid, withLeads]);

  const run = useCallback(
    async (keys?: RepSectionKey[], { quiet = false }: { quiet?: boolean } = {}) => {
      const all = loaders();
      const wanted = (keys ?? (Object.keys(all) as RepSectionKey[])).filter((key) => all[key]);
      if (!wanted.length) return;

      const token = await getIdToken().catch(() => null);

      await Promise.allSettled(
        wanted.map(async (key) => {
          controllers.current.get(key)?.abort();
          const controller = new AbortController();
          controllers.current.set(key, controller);
          try {
            const data = await all[key]!(token, controller.signal);
            if (controller.signal.aborted) return;
            setState((current) => ({ ...current, [key]: { status: 'ready', data } }));
          } catch (error) {
            // Only a real abort (unmount / superseded retry) is silent. A plain
            // network failure must surface as "Couldn't load", never spin forever.
            if (controller.signal.aborted) return;
            console.error(`Dashboard section "${key}" failed:`, error);
            // A quiet refresh keeps what is on screen rather than trading it for an error.
            if (quiet) return;
            setState((current) => ({ ...current, [key]: { status: 'error' } }));
          }
        })
      );
    },
    [loaders]
  );

  useEffect(() => {
    const running = controllers.current;
    void run();
    return () => {
      for (const controller of running.values()) controller.abort();
      running.clear();
    };
  }, [run]);

  const retry = useCallback(
    (key: RepSectionKey) => {
      setState((current) => ({ ...current, [key]: LOADING }));
      void run([key]);
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

  return { ...state, retry, installDateSaved };
}
