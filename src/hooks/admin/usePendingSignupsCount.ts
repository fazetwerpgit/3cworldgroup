'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

/**
 * Live count of `users` docs with status 'pending' and no fieldRole
 * (self-signups awaiting role assignment). Only mounts the listener when `enabled` is true — the
 * underlying query requires the admin/operations read rule
 * (firestore.rules), so non-admins must never subscribe or they'll trip a
 * permission-denied error.
 */
export function usePendingSignupsCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!db || !enabled) {
      return;
    }

    const pendingQuery = query(collection(db, 'users'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(
      pendingQuery,
      (snapshot) => setCount(snapshot.docs.filter((doc) => !doc.get('fieldRole') && !doc.get('suspectedBot')).length),
      (err) => {
        // Fail closed: no badge is better than a stale/wrong one.
        console.error('Error listening to pending signups:', err);
        setCount(0);
      }
    );
    // Reset on unmount/disable (e.g. role changes) so a stale count never lingers.
    return () => {
      unsubscribe();
      setCount(0);
    };
  }, [enabled]);

  return count;
}
