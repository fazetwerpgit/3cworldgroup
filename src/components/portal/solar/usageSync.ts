'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeadExtras } from '@/lib/solar/leadFields';
import { useDeck } from './deckState';
import { updateLeadExtras } from './solarClient';
import { estimateUsage, type UsageEntry } from './usage';

// The usage slide comes after the lead is saved, so what the rep enters there
// is sent to the lead with PATCH .../leads/{id} ({monthlyKwh, usage}): a short
// pause after typing, and again when the slide closes (Next / Back) if a
// change is still unsent. A failed save never blocks the deck; the slide shows
// a quiet note and the next change (or leaving the slide) tries again.

export const USAGE_SAVE_DELAY_MS = 1200;

/** The lead fields for what was entered. monthlyKwh only once there is an estimate. */
export function usagePatch(entry: UsageEntry): Pick<LeadExtras, 'monthlyKwh' | 'usage'> {
  const estimate = estimateUsage(entry);
  return {
    usage: { mode: entry.mode, monthly: entry.monthly, daily: entry.daily, months: [...entry.months] },
    ...(estimate ? { monthlyKwh: estimate.monthlyKwh } : {}),
  };
}

/** What deckState `usageSaved` holds: the lead and the patch last saved to it. */
export function usageSaveKey(leadId: string, entry: UsageEntry): string {
  return `${leadId}|${JSON.stringify(usagePatch(entry))}`;
}

/**
 * Whether the entry still needs sending: a lead exists, this exact entry
 * isn't the one saved, and there is something to say (an estimate, or a
 * clearing of what was saved to this lead before).
 */
export function usageNeedsSave(leadId: string | null, entry: UsageEntry, saved: string | null): boolean {
  if (!leadId) return false;
  if (usageSaveKey(leadId, entry) === saved) return false;
  return estimateUsage(entry) !== null || Boolean(saved?.startsWith(`${leadId}|`));
}

export type UsageSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export function useUsageSync(): UsageSaveStatus {
  const { state, update } = useDeck();
  const [status, setStatus] = useState<UsageSaveStatus>('idle');
  const { leadId, usage, usageSaved } = state;
  const pending = usageNeedsSave(leadId, usage, usageSaved);

  const save = useCallback(
    async (id: string, entry: UsageEntry, mounted: { current: boolean }) => {
      const key = usageSaveKey(id, entry);
      if (mounted.current) setStatus('saving');
      const res = await updateLeadExtras(id, usagePatch(entry));
      if (res.ok) update({ usageSaved: key });
      if (mounted.current) setStatus(res.ok ? 'saved' : 'failed');
    },
    [update]
  );

  const mounted = useRef(true);
  // The newest unsent entry, for the flush when the slide closes.
  const latest = useRef<{ id: string; entry: UsageEntry } | null>(null);
  useEffect(() => {
    latest.current = pending && leadId ? { id: leadId, entry: usage } : null;
  }, [pending, leadId, usage]);

  useEffect(() => {
    if (!pending || !leadId) return;
    const timer = window.setTimeout(() => {
      latest.current = null;
      void save(leadId, usage, mounted);
    }, USAGE_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, leadId, usage, save]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const unsent = latest.current;
      if (unsent) void save(unsent.id, unsent.entry, mounted);
    };
  }, [save]);

  return status;
}
