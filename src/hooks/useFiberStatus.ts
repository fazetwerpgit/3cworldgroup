'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useCacheSubject } from '@/lib/cache/useCacheSubject';
import { readDataCache, writeDataCache } from '@/lib/cache/dataCache';
import type { FiberStatusResponse } from '@/types';

const FIBER_CACHE_KEY = 'fiber-status';

export function useFiberStatus() {
  const uid = useCacheSubject();
  // Revisit: last time's report shows at once while the first fetch refreshes it.
  const [data, setData] = useState<FiberStatusResponse | null>(
    () => readDataCache<FiberStatusResponse>(uid, FIBER_CACHE_KEY) ?? null
  );
  const [loading, setLoading] = useState(() => !readDataCache(uid, FIBER_CACHE_KEY));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const fetchStatus = useCallback(async (initial = false, fresh = false) => {
    // With a cached report on screen the first fetch is a background refresh:
    // no skeleton, and a failure keeps the report instead of an error.
    const background = initial && readDataCache(uid, FIBER_CACHE_KEY) !== undefined;
    if (initial && !background) setLoading(true);
    else if (!initial) setRefreshing(true);

    try {
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

      writeDataCache(uid, FIBER_CACHE_KEY, responseData as FiberStatusResponse);
      if (activeRef.current) {
        setData(responseData as FiberStatusResponse);
        setError(null);
      }
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch fiber status');
      if (activeRef.current && initial && !background) setError(fetchError.message);
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

  return { data, loading, refreshing, error, refetch };
}
