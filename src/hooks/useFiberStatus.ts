'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useCacheSubject } from '@/lib/cache/useCacheSubject';
import {
  awaitPendingDataCacheRead,
  dataCacheGeneration,
  readDataCacheEntry,
  writeDataCache,
} from '@/lib/cache/dataCache';
import type { FiberStatusResponse } from '@/types';

/** Cache key of the carrier report (the dashboard and the tab prefetch fill it too). */
export const FIBER_CACHE_KEY = 'fiber-status';

export function useFiberStatus() {
  const uid = useCacheSubject();
  // Revisit: last time's report shows at once while the first fetch refreshes it.
  const [cachedEntry] = useState(() => readDataCacheEntry<FiberStatusResponse>(uid, FIBER_CACHE_KEY));
  const [data, setData] = useState<FiberStatusResponse | null>(() => cachedEntry?.value ?? null);
  const [loading, setLoading] = useState(() => !cachedEntry);
  // A background refresh failed with the cached report still showing: when that report was read.
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const fetchStatus = useCallback(async (initial = false, fresh = false) => {
    // With a cached report on screen the first fetch is a background refresh:
    // no skeleton, and a failure keeps the report instead of an error.
    const shown = initial ? readDataCacheEntry<FiberStatusResponse>(uid, FIBER_CACHE_KEY) : undefined;
    const background = shown !== undefined;
    // An answer from before an account switch never lands in the new account's cache.
    const gen = dataCacheGeneration();
    if (initial && !background) setLoading(true);
    else if (!initial) setRefreshing(true);

    try {
      // The tab prefetch is already reading the report: use its answer.
      const prefetched = fresh ? undefined : await awaitPendingDataCacheRead<FiberStatusResponse>(uid, FIBER_CACHE_KEY);
      if (prefetched) {
        if (activeRef.current) {
          setData(prefetched.value);
          setError(null);
          setStaleAt(null);
        }
        return;
      }
      const token = await getIdToken();
      // `fresh` bypasses the server's fiberOrders cache. It is only for the
      // refetch that follows a write: invalidation clears the serverless
      // instance that served the write, so a plain refetch can land on another
      // warm instance and return the pre-write snapshot for minutes — the row
      // stays unchanged with no error, and the admin clicks again.
      const response = await fetch(`/api/portal/sales/status${fresh ? '?fresh=1' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to fetch fiber status');
      }

      writeDataCache(uid, FIBER_CACHE_KEY, responseData as FiberStatusResponse, gen);
      if (activeRef.current) {
        setData(responseData as FiberStatusResponse);
        setError(null);
        setStaleAt(null);
      }
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch fiber status');
      if (activeRef.current && initial && !background) setError(fetchError.message);
      if (activeRef.current && shown) setStaleAt(shown.at);
      if (!initial) throw fetchError;
    } finally {
      if (activeRef.current) {
        if (initial) setLoading(false);
        else setRefreshing(false);
      }
    }
  }, [uid]);

  useEffect(() => {
    activeRef.current = true;
    void fetchStatus(true).catch(() => undefined);

    return () => {
      activeRef.current = false;
    };
  }, [fetchStatus]);

  const refetch = useCallback(
    (opts?: { fresh?: boolean }) => fetchStatus(false, opts?.fresh === true),
    [fetchStatus]
  );

  return { data, loading, refreshing, error, staleAt, refetch };
}
