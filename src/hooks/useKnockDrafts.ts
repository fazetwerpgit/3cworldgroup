'use client';

import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { KnockSaleDraft } from '@/lib/sales/knockDrafts';

/**
 * The rep's open sale drafts from 3C Doors, for Log sale's "Finish your sales"
 * list. A failed load shows no list: the rep can still log a sale by hand, and
 * the drafts are there next time.
 */
export function useKnockDrafts() {
  const [drafts, setDrafts] = useState<KnockSaleDraft[]>([]);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const response = await fetch('/api/portal/sales/drafts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load sale drafts');
      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
    } catch (err) {
      console.error('Sale drafts load failed:', err instanceof Error ? err.message : err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Dismiss a draft. Gone from the list at once; reloaded if the server says no. */
  const dismiss = useCallback(
    async (id: string) => {
      setDrafts((prev) => prev.filter((draft) => draft.id !== id));
      try {
        const token = await getIdToken();
        const response = await fetch(`/api/portal/sales/drafts/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        // 404/409: already gone or already logged. Either way it is off the list.
        if (!response.ok && response.status !== 404 && response.status !== 409) {
          throw new Error(`Dismiss failed (${response.status})`);
        }
      } catch (err) {
        console.error('Sale draft dismiss failed:', err instanceof Error ? err.message : err);
        await load();
      }
    },
    [load]
  );

  return { drafts, dismiss };
}
