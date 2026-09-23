'use client';

import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useAuth } from '@/contexts/AuthContext';
import { PAY_DELAY_DAYS } from '@/types';
import type { CompPlanCompanyRates, CompPlanResponse, CompPlanRole } from '@/types';

export interface CompPlanResult {
  /** The caller's own rates, company → planId → dollars. Null when their role has no slice. */
  rates: CompPlanCompanyRates | null;
  compRole: CompPlanRole | null;
  payDelayDays: number;
  hasPlan: boolean;
  loading: boolean;
  /**
   * The rates could not be fetched. Distinct from "no plan assigned": the rep
   * has a plan we could not read, so the page says "Couldn't load pay rates"
   * and offers `retry` instead of implying there is nothing to pay.
   */
  error: boolean;
  retry: () => void;
}

type PlanState = Omit<CompPlanResult, 'loading' | 'retry'> & { uid: string | null };

const EMPTY: PlanState = {
  uid: null,
  rates: null,
  compRole: null,
  payDelayDays: PAY_DELAY_DAYS,
  hasPlan: false,
  error: false,
};

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
  const [plan, setPlan] = useState<PlanState>(EMPTY);
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
    setLoading(true);

    (async () => {
      try {
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

        // `scope: 'all'` hands back the role-keyed table, which is nobody's
        // personal rate card — a platform caller's own slice arrives as
        // `ownRates` instead. Reading `rates` there would hand the pay view a
        // table keyed by role where it expects one keyed by company.
        const rates =
          data.scope === 'all'
            ? (data.ownRates as CompPlanCompanyRates | null) ?? null
            : (data.rates as CompPlanCompanyRates | null) ?? null;
        setPlan({
          uid,
          rates,
          compRole: data.compRole ?? null,
          payDelayDays: data.payDelayDays ?? PAY_DELAY_DAYS,
          hasPlan: !!rates,
          error: false,
        });
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
    retry,
  };
}
