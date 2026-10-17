'use client';

import { useEffect, useRef } from 'react';
import { onRevalidateDataCache } from './dataCache';

/**
 * Registers this screen's quiet refetch for pull to refresh
 * (revalidateDataCache) while it is mounted and `enabled`. `refresh` must keep
 * the data on screen and swap it when the new data arrives; returning its
 * promise lets the spinner stay until the data is in.
 */
export function useRevalidateOnPull(refresh: () => unknown, enabled = true): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    return onRevalidateDataCache(() => refreshRef.current());
  }, [enabled]);
}
