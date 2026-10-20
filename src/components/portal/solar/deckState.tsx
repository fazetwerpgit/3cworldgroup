'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { newFormUploadId } from '@/lib/forms/formUploads';
import {
  contactKey,
  EMPTY_LEAD,
  newDeckClientId,
  type CreditTier,
  type LeadFields,
  type PhotoSlot,
  type SolarMode,
} from './solarClient';
import type { RoofChoice } from './RoofTypeField';
import { EMPTY_USAGE, estimateUsage, normalizeUsage, type UsageEntry } from './usage';

// One deck session: what the homeowner typed, carried across slides. Kept in
// sessionStorage so a reload mid-pitch keeps the same clientId (the lead POST
// dedupes on it) and the same answers.

/** `tz`: the customer's zone the time was booked in (older sessions: none). */
export type Booking = { id: string; start: string; mode: SolarMode; consultantName: string; tz?: string };

export type DeckState = {
  clientId: string;
  uploadId: string;
  monthlyBill: number;
  /**
   * Average monthly kWh from the usage helper (null until entered). The lead
   * field the knock app also sends; `usage` holds what the rep typed.
   */
  monthlyKwh: number | null;
  usage: UsageEntry;
  apy: number;
  years: number;
  lead: LeadFields;
  photos: Partial<Record<PhotoSlot, string>>;
  /** The roof answer on the lead form; a blocked roof stops the lead. */
  roofType: RoofChoice | null;
  leadId: string | null;
  /** usageSync's key for the usage last saved to the lead (null: none yet). */
  usageSaved: string | null;
  /** contactKey of the contact fields as the server holds them (null until the lead is saved). */
  savedContact: string | null;
  creditTier: CreditTier | null;
  /** "Under 600" on the prequal slide: the lead is saved as no sale (low credit), with no tier. */
  lowCredit: boolean;
  booking: Booking | null;
};

const STORAGE_KEY = '3c-solar-deck';

function freshState(): DeckState {
  return {
    clientId: newDeckClientId(),
    uploadId: newFormUploadId(),
    monthlyBill: 150,
    monthlyKwh: null,
    usage: { ...EMPTY_USAGE, months: [...EMPTY_USAGE.months] },
    apy: 0.05,
    years: 25,
    lead: { ...EMPTY_LEAD },
    photos: {},
    roofType: null,
    leadId: null,
    usageSaved: null,
    savedContact: null,
    creditTier: null,
    lowCredit: false,
    booking: null,
  };
}

function loadState(): DeckState {
  const fresh = freshState();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as Partial<DeckState>;
    const usage = normalizeUsage(saved.usage);
    const lead = { ...fresh.lead, ...(saved.lead ?? {}) };
    return {
      ...fresh,
      ...saved,
      lead,
      usage,
      monthlyKwh: estimateUsage(usage)?.monthlyKwh ?? null,
      // A session saved before contact edits existed: what it holds is what was sent.
      savedContact: saved.savedContact ?? (saved.leadId ? contactKey(lead) : null),
    };
  } catch {
    return fresh;
  }
}

/**
 * Whether this deck holds a homeowner the rep hasn't finished with: anything
 * typed, uploaded or saved, and no booking yet. Starting a new customer then
 * asks first. A homeowner who didn't pre-qualify (Under 600) is finished.
 */
export function hasLeadInProgress(state: DeckState): boolean {
  if (state.booking || state.lowCredit) return false;
  if (state.leadId || state.creditTier) return true;
  if (Object.values(state.photos).some(Boolean)) return true;
  if (state.monthlyKwh !== null) return true;
  return Object.values(state.lead).some((v) => v.trim() !== '');
}

type DeckContextValue = {
  state: DeckState;
  update: (patch: Partial<DeckState> | ((prev: DeckState) => Partial<DeckState>)) => void;
  /** Clears everything for the next homeowner: fresh clientId and uploadId, no lead, no booking. */
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
