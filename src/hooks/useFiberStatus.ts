'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { FiberStatusResponse } from '@/types';

export function useFiberStatus() {
  const [data, setData] = useState<FiberStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const fetchStatus = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);

    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/sales/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to fetch fiber status');
      }

      if (activeRef.current) {
        setData(responseData as FiberStatusResponse);
        setError(null);
      }
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch fiber status');
      if (activeRef.current && initial) setError(fetchError.message);
      if (!initial) throw fetchError;
    } finally {
      if (activeRef.current) {
        if (initial) setLoading(false);
        else setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void fetchStatus(true).catch(() => undefined);

    return () => {
      activeRef.current = false;
    };
  }, [fetchStatus]);

  const refetch = useCallback(() => fetchStatus(), [fetchStatus]);

  return { data, loading, refreshing, error, refetch };
}
