'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { MoneySummary, OwnerSection, OwnerSummary, ProblemRow, RecruitingSummary } from '@/lib/owner/companySummary';
import type { Section } from '@/hooks/useRepDashboard';

// The owner's company view. The first load is ONE request for all three
// sections, so the server reads the sales book once. A failed section reports
// 'error' (never zeros) and its Retry asks for that section alone. Coming back
// to the app reloads all three quietly: the numbers on screen stay until the
// new ones land, and a failed quiet reload keeps them.

export interface OwnerDashboardState {
  money: Section<MoneySummary>;
  problems: Section<ProblemRow[]>;
  recruiting: Section<RecruitingSummary>;
}

const SECTIONS: OwnerSection[] = ['money', 'problems', 'recruiting'];
const LOADING = { status: 'loading' } as const;

async function loadSummary(sections: OwnerSection[], token: string | null, signal: AbortSignal) {
  const query = sections.length === 1 ? `?section=${sections[0]}` : '';
  const response = await fetch(`/api/portal/owner/summary${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  const data = (await response.json().catch(() => null)) as (OwnerSummary & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

export function useOwnerDashboard(enabled = true) {
  const [state, setState] = useState<OwnerDashboardState>({ money: LOADING, problems: LOADING, recruiting: LOADING });
  // The request each section is waiting on; a stale response never overwrites a newer one.
  const controllers = useRef(new Map<OwnerSection, AbortController>());

  const run = useCallback(
    async (keys: OwnerSection[] = SECTIONS, { quiet = false } = {}) => {
      if (!enabled) return;
      const controller = new AbortController();
      for (const key of keys) controllers.current.set(key, controller);
      const current = (key: OwnerSection) =>
        !controller.signal.aborted && controllers.current.get(key) === controller;

      const token = await getIdToken().catch(() => null);
      try {
        const data = await loadSummary(keys, token, controller.signal);
        setState((prev) => {
          const next = { ...prev };
          for (const key of keys) {
            if (!current(key)) continue;
            const value = data[key];
            if (value === undefined) {
              console.error(`Owner dashboard section "${key}" failed`);
              if (!(quiet && prev[key].status === 'ready')) next[key] = { status: 'error' };
            } else {
              (next as Record<OwnerSection, unknown>)[key] = { status: 'ready', data: value };
            }
          }
          return next;
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(`Owner dashboard (${keys.join(', ')}) failed:`, error);
        setState((prev) => {
          const next = { ...prev };
          for (const key of keys) {
            if (current(key) && !(quiet && prev[key].status === 'ready')) next[key] = { status: 'error' };
          }
          return next;
        });
      }
    },
    [enabled]
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
    (key: OwnerSection) => {
      setState((current) => ({ ...current, [key]: LOADING }));
      void run([key]);
    },
    [run]
  );

  const refresh = useCallback(() => void run(SECTIONS, { quiet: true }), [run]);
  useRefreshOnResume(refresh, { enabled });

  return { ...state, retry };
}
