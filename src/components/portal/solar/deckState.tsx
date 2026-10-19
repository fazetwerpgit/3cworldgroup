'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { newFormUploadId } from '@/lib/forms/formUploads';
import {
  EMPTY_LEAD,
  newDeckClientId,
  type CreditTier,
  type LeadFields,
  type PhotoSlot,
  type SolarMode,
} from './solarClient';

// One deck session: what the homeowner typed, carried across slides. Kept in
// sessionStorage so a reload mid-pitch keeps the same clientId (the lead POST
// dedupes on it) and the same answers.

export type Booking = { id: string; start: string; mode: SolarMode; consultantName: string };

export type DeckState = {
  clientId: string;
  uploadId: string;
  monthlyBill: number;
  apy: number;
  years: number;
  lead: LeadFields;
  photos: Partial<Record<PhotoSlot, string>>;
  leadId: string | null;
  creditTier: CreditTier | null;
  booking: Booking | null;
};

const STORAGE_KEY = '3c-solar-deck';

function freshState(): DeckState {
  return {
    clientId: newDeckClientId(),
    uploadId: newFormUploadId(),
    monthlyBill: 150,
    apy: 0.05,
    years: 25,
    lead: { ...EMPTY_LEAD },
    photos: {},
    leadId: null,
    creditTier: null,
    booking: null,
  };
}

function loadState(): DeckState {
  const fresh = freshState();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as Partial<DeckState>;
    return { ...fresh, ...saved, lead: { ...fresh.lead, ...(saved.lead ?? {}) } };
  } catch {
    return fresh;
  }
}

type DeckContextValue = {
  state: DeckState;
  update: (patch: Partial<DeckState> | ((prev: DeckState) => Partial<DeckState>)) => void;
  reset: () => void;
};

const DeckContext = createContext<DeckContextValue | null>(null);

export function DeckProvider({ children }: { children: ReactNode }) {
  // The deck only renders on the client (behind ProtectedRoute), so storage can be read up front.
  const [state, setState] = useState<DeckState>(() => (typeof window === 'undefined' ? freshState() : loadState()));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode or storage full: the deck still works for this view.
    }
  }, [state]);

  const update = useCallback(
    (patch: Partial<DeckState> | ((prev: DeckState) => Partial<DeckState>)) =>
      setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })),
    []
  );
  const reset = useCallback(() => setState(freshState()), []);
  const value = useMemo(() => ({ state, update, reset }), [state, update, reset]);
  return <DeckContext.Provider value={value}>{children}</DeckContext.Provider>;
}

export function useDeck(): DeckContextValue {
  const value = useContext(DeckContext);
  if (!value) throw new Error('useDeck outside DeckProvider');
  return value;
}
