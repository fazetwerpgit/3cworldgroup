'use client';

import { useCallback } from 'react';
import { useOpsQueues } from '@/components/portal/admin-d/opsQueues';
import { auth } from '@/lib/firebase/config';

/**
 * AdminQueue's onMarkHandled for a form review endpoint. A 409 means another
 * admin handled it first, so the item is done either way. On success the row
 * flips via onHandled and the Requests tab/nav counts reload.
 */
export function useMarkHandled(reviewUrl: string, onHandled: (id: string) => void) {
  const { refresh } = useOpsQueues();
  return useCallback(
    async (id: string) => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(reviewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok && res.status !== 409) throw new Error('Failed to mark handled');
      onHandled(id);
      refresh();
    },
    [reviewUrl, onHandled, refresh]
  );
}
