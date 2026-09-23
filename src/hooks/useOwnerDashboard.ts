'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { MoneySummary, OwnerSection, OwnerSummary, ProblemRow, RecruitingSummary } from '@/lib/owner/companySummary';
import type { Section } from '@/hooks/useRepDashboard';

// The owner's company view: one request per section, all in parallel, each
// rendering as it lands. A failed section reports 'error' and retries alone —
// it never shows zeros.

export interface OwnerDashboardState {
  money: Section<MoneySummary>;
  problems: Section<ProblemRow[]>;
  recruiting: Section<RecruitingSummary>;
}

const SECTIONS: OwnerSection[] = ['money', 'problems', 'recruiting'];
const LOADING = { status: 'loading' } as const;

async function loadSection(section: OwnerSection, token: string | null, signal: AbortSignal) {
  const response = await fetch(`/api/portal/owner/summary?section=${section}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  const data = (await response.json().catch(() => null)) as (OwnerSummary & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || `Request failed (${response.status})`);
  const value = data[section];
  if (value === undefined) throw new Error(`Missing ${section}`);
  return value;
}

export function useOwnerDashboard(enabled = true) {
  const [state, setState] = useState<OwnerDashboardState>({ money: LOADING, problems: LOADING, recruiting: LOADING });
  const controllers = useRef(new Map<OwnerSection, AbortController>());

  const run = useCallback(
    async (keys: OwnerSection[] = SECTIONS) => {
      if (!enabled) return;
      const token = await getIdToken().catch(() => null);
      await Promise.allSettled(
        keys.map(async (key) => {
          controllers.current.get(key)?.abort();
          const controller = new AbortController();
          controllers.current.set(key, controller);
          try {
            const data = await loadSection(key, token, controller.signal);
            if (controller.signal.aborted) return;
            setState((current) => ({ ...current, [key]: { status: 'ready', data } }));
          } catch (error) {
            if (controller.signal.aborted) return;
            console.error(`Owner dashboard section "${key}" failed:`, error);
            setState((current) => ({ ...current, [key]: { status: 'error' } }));
          }
        })
      );
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

  return { ...state, retry };
}
