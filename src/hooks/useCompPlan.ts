'use client';

import { useEffect, useState } from 'react';
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
}

const EMPTY: Omit<CompPlanResult, 'loading'> & { uid: string | null } = {
  uid: null,
  rates: null,
  compRole: null,
  payDelayDays: PAY_DELAY_DAYS,
  hasPlan: false,
};

/**
 * The signed-in field user's own slice of the comp plan, fetched once per login.
 *
 * Management callers get `scope: 'all'` from the route — a role-keyed table, not
 * a rate table for anyone in particular — so this hook reports no plan for them:
 * the Pay view and the expected-pay tile are personal, and a manager has no
 * personal rate to show.
 */
export function useCompPlan(): CompPlanResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const status = user?.status;
  // Tagged with the uid it was fetched for, so a user switch can never briefly
  // show the previous rep's rates.
  const [plan, setPlan] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

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

        if (!response.ok || data.scope !== 'own') {
          setPlan({ ...EMPTY, uid, payDelayDays: data?.payDelayDays ?? PAY_DELAY_DAYS });
          return;
        }

        const rates = (data.rates as CompPlanCompanyRates | null) ?? null;
        setPlan({
          uid,
          rates,
          compRole: data.compRole ?? null,
          payDelayDays: data.payDelayDays ?? PAY_DELAY_DAYS,
          hasPlan: !!rates,
        });
      } catch (error) {
        // Expected pay is supporting information — a failed fetch degrades to
        // "no plan" (dashes everywhere) rather than breaking the sales page.
        if (!cancelled) {
          console.error('Error fetching comp plan:', error);
          setPlan({ ...EMPTY, uid });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, uid]);

  const settled = plan.uid === uid;
  return {
    rates: settled ? plan.rates : null,
    compRole: settled ? plan.compRole : null,
    payDelayDays: settled ? plan.payDelayDays : PAY_DELAY_DAYS,
    hasPlan: settled && plan.hasPlan,
    loading,
  };
}
