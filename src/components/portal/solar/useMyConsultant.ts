'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { SolarMode, WeeklyWindow } from '@/lib/solar/availability';

/** The signed-in person's consultant card as GET /api/portal/solar/consultants/{uid} answers it. */
export interface MyConsultantDoc {
  consultantUid: string;
  name: string;
  tz: string;
  slotMin: number;
  modes: Partial<Record<SolarMode, WeeklyWindow[]>>;
  meetLink?: string;
  phone?: string;
  googleCalendar?: unknown;
}

/**
 * 'loading' until known; 'none' when the signed-in person takes no
 * consultations (the API's 404); 'failed' on any other error. The server
 * decides whose card it is from the verified token; this only ever asks for
 * the caller's own uid.
 */
export type MyConsultant =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'failed' }
  | { state: 'ready'; consultant: MyConsultantDoc; seeded: boolean };

export function useMyConsultant() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [mine, setMine] = useState<MyConsultant>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/portal/solar/consultants/${encodeURIComponent(uid)}`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          cache: 'no-store',
        });
        if (!active) return;
        if (res.status === 404 || res.status === 403) {
          setMine({ state: 'none' });
          return;
        }
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !data?.consultant) {
          setMine({ state: 'failed' });
          return;
        }
        setMine({ state: 'ready', consultant: data.consultant as MyConsultantDoc, seeded: data.seeded === true });
      } catch {
        if (active) setMine({ state: 'failed' });
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, attempt]);

  const retry = useCallback(() => {
    setMine({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { mine, retry };
}
