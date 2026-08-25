'use client';

import { useEffect, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { FiberStatusResponse } from '@/types';

export function useFiberStatus() {
  const [data, setData] = useState<FiberStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const token = await getIdToken();
        const response = await fetch('/api/portal/sales/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(responseData.error || 'Failed to fetch fiber status');
        }

        if (active) setData(responseData as FiberStatusResponse);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to fetch fiber status');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
