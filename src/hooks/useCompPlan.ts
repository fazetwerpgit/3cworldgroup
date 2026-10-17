'use client';

import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useAuth } from '@/contexts/AuthContext';
import { awaitPendingDataCacheRead, dataCacheGeneration, readDataCache, writeDataCache } from '@/lib/cache/dataCache';
import { PAY_DELAY_DAYS } from '@/types';
import type { CompPlanCompanyRates, CompPlanRates, CompPlanResponse, CompPlanRole } from '@/types';
import type { OwnerPricing } from '@/lib/owner/revenue';

export interface CompPlanResult {
  /** The caller's own rates, company → planId → dollars. Null when their role has no slice. */
  rates: CompPlanCompanyRates | null;
  compRole: CompPlanRole | null;
  payDelayDays: number;
  hasPlan: boolean;
  /** Revenue tables for pricing 3C's take per sale. Only an owner ever gets these; null for everyone else. */
  ownerPricing: OwnerPricing | null;
  loading: boolean;
  /**
   * The rates could not be fetched. Distinct from "no plan assigned": the rep
   * has a plan we could not read, so the page says "Couldn't load pay rates"
   * and offers `retry` instead of implying there is nothing to pay.
   */
  error: boolean;
  retry: () => void;
}

export type PlanState = Omit<CompPlanResult, 'loading' | 'retry'> & { uid: string | null };

/** Cache key of the plan (the dashboard and the tab prefetch fill it too). */
export const COMP_PLAN_CACHE_KEY = 'comp-plan';

const EMPTY: PlanState = {
  uid: null,
  rates: null,
  compRole: null,
  payDelayDays: PAY_DELAY_DAYS,
  hasPlan: false,
  error: false,
  ownerPricing: null,
};

/** The cached plan state for a successful /api/portal/comp-plan answer. */
export function compPlanState(uid: string, data: CompPlanResponse): PlanState {
  // `scope: 'all'` hands back the role-keyed table, which is nobody's
  // personal rate card — a platform caller's own slice arrives as
  // `ownRates` instead. Reading `rates` there would hand the pay view a
  // table keyed by role where it expects one keyed by company.
  const rates =
    data.scope === 'all'
      ? (data.ownRates as CompPlanCompanyRates | null) ?? null
      : (data.rates as CompPlanCompanyRates | null) ?? null;
  return {
    uid,
    rates,
    compRole: data.compRole ?? null,
    payDelayDays: data.payDelayDays ?? PAY_DELAY_DAYS,
    hasPlan: !!rates,
    error: false,
    ownerPricing:
      data.scope === 'all' && data.margin
        ? {
            margin: data.margin,
            rates: (data.rates as Partial<CompPlanRates> | null) ?? {},
            repCompRoles: data.repCompRoles ?? {},
          }
        : null,
  };
}

/**
 * The signed-in user's own slice of the comp plan, fetched once per login.
 *
 * Management callers get `scope: 'all'` from the route — a role-keyed table, not
 * a rate table for anyone in particular — plus `ownRates`, their personal slice.
 * Admins and owners are paid on the Internal Rep scale, so they do get a plan
 * here; operations resolves to one only if they carry a field role.
 */
export function useCompPlan(): CompPlanResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const status = user?.status;
  // Tagged with the uid it was fetched for, so a user switch can never briefly
  // show the previous rep's rates.
  // Revisit: the plan read last time shows at once and refreshes underneath.
  const [plan, setPlan] = useState<PlanState>(() => readDataCache<PlanState>(uid, COMP_PLAN_CACHE_KEY) ?? EMPTY);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    // Pending users are rejected by the route's verified-requester gate.
    if (!uid || status !== 'active') {
      setPlan(EMPTY);
      return;
    }

    let cancelled = false;
    // A cached plan stays on screen while it refreshes. A failed refresh flags
    // the error as before (never a stale plan passing as current).
    const cached = readDataCache<PlanState>(uid, COMP_PLAN_CACHE_KEY);
    const gen = dataCacheGeneration();
    if (!cached) setLoading(true);

    (async () => {
      try {
        // The tab prefetch is already reading the plan: use its answer.
        const prefetched = await awaitPendingDataCacheRead<PlanState>(uid, COMP_PLAN_CACHE_KEY);
        if (prefetched) {
          if (!cancelled) setPlan(prefetched.value);
          return;
        }
        const token = await getIdToken();
        const response = await fetch('/api/portal/comp-plan', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await response.json()) as CompPlanResponse & { error?: string };
        if (cancelled) return;

        if (!response.ok) {
          setPlan({ ...EMPTY, uid, payDelayDays: data?.payDelayDays ?? PAY_DELAY_DAYS, error: true });
          return;
        }

        const next = compPlanState(uid, data);
        writeDataCache(uid, COMP_PLAN_CACHE_KEY, next, gen);
        setPlan(next);
      } catch (error) {
        // Expected pay is supporting information: a failed fetch never breaks
        // the page, but it is flagged so it cannot pass for "no plan".
        if (!cancelled) {
          console.error('Error fetching comp plan:', error);
          setPlan({ ...EMPTY, uid, error: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, status, uid]);

  const settled = plan.uid === uid;
  return {
    rates: settled ? plan.rates : null,
    compRole: settled ? plan.compRole : null,
    payDelayDays: settled ? plan.payDelayDays : PAY_DELAY_DAYS,
    hasPlan: settled && plan.hasPlan,
    loading,
    error: settled && plan.error,
    ownerPricing: settled ? plan.ownerPricing : null,
    retry,
  };
}
