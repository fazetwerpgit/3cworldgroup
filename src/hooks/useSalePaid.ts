'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';

export interface SalePaidResult {
  /** saleId → true. Only ids the caller has ticked appear. */
  paidBySale: Record<string, boolean>;
  togglePaid: (saleId: string) => Promise<void>;
}

/**
 * The caller's PRIVATE "I've been paid for this" ticks, mirroring the chat read
 * receipts pattern (users/{uid}/chatReads): one doc per sale under
 * users/{uid}/salePaid, holding only a paidAt timestamp, readable and writable
 * by that user alone. Nobody else — not a manager, not an admin — sees these;
 * they are a rep's own reconciliation against their paycheck, not a payroll record.
 *
 * Writes go through the client SDK, so setDoc/deleteDoc surface in this
 * subscription immediately (and roll back on their own if the write is rejected),
 * which is what makes the checkbox feel instant without a manual optimistic layer.
 */
export function useSalePaid(uid: string | null | undefined): SalePaidResult {
  const { user } = useAuth();
  // uid-tagged so a user switch can't briefly show the previous rep's ticks.
  const [paid, setPaid] = useState<{ uid: string | null; bySale: Record<string, boolean> }>({
    uid: null,
    bySale: {},
  });

  useEffect(() => {
    // Pending reps lack rules access to their own subcollections.
    if (!db || !uid || user?.status !== 'active') return;

    const paidCol = collection(db, 'users', uid, 'salePaid');
    return onSnapshot(
      paidCol,
      (snapshot) => {
        const bySale: Record<string, boolean> = {};
        snapshot.docs.forEach((docSnap) => {
          // 'estimate' fills a still-pending serverTimestamp with a local guess
          // instead of null, so a just-ticked box never reads back as unticked.
          const data = docSnap.data({ serverTimestamps: 'estimate' });
          bySale[docSnap.id] = !!data.paidAt;
        });
        setPaid({ uid, bySale });
      },
      (err) => {
        console.error('Error listening to sale paid marks:', err);
      }
    );
  }, [uid, user?.status]);

  const paidBySale = useMemo(() => (paid.uid === uid ? paid.bySale : {}), [paid, uid]);

  const togglePaid = useCallback(
    async (saleId: string) => {
      if (!db || !uid || !saleId) return;
      const ref = doc(db, 'users', uid, 'salePaid', saleId);
      if (paidBySale[saleId]) {
        await deleteDoc(ref);
        return;
      }
      // paidAt is the only field the rules accept.
      await setDoc(ref, { paidAt: serverTimestamp() });
    },
    [paidBySale, uid]
  );

  return { paidBySale, togglePaid };
}
