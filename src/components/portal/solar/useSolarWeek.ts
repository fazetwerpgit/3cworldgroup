'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { fetchSolarWeek, type SolarWeekCounts } from './solarClient';

export type SolarWeekState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: SolarWeekCounts };

/**
 * The viewer's solar numbers this week (Set, Demoed, Closed) in one read, as
 * the solar board counts them. Refreshed quietly when the app comes back; a
 * failed quiet refresh keeps the numbers already shown.
 */
export function useSolarWeek(enabled = true) {
  const [state, setState] = useState<SolarWeekState>({ status: 'loading' });
  const load = useCallback(async (background = false) => {
    const res = await fetchSolarWeek();
    if (res.ok) setState({ status: 'ready', data: res.data.mine });
    else if (!background) setState({ status: 'error' });
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // The first read lands asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [enabled, load]);
  useRefreshOnResume(() => (enabled ? load(true) : undefined), { enabled });
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void load();
  }, [load]);
  return { state, retry };
}
