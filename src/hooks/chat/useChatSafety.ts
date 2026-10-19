'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReportReason } from '@/lib/chat/moderationShared';

type AuthedFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ChatSafety {
  /** People the reader blocked: their messages collapse on this reader's screens. */
  blockedUids: ReadonlySet<string>;
  /** null until known (loading, or the call failed); then whether the chat agreement was accepted. */
  termsAccepted: boolean | null;
  acceptTerms: () => Promise<void>;
  /** The send route refused a message until the agreement is accepted: treat it as not accepted. */
  requireTerms: () => void;
  block: (uid: string) => Promise<string>;
  unblock: (uid: string) => Promise<void>;
  report: (input: { channelId: string; messageId: string; reason: ReportReason }) => Promise<void>;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null);
  return new Error(body && typeof body.error === 'string' ? body.error : fallback);
}

const NO_BLOCKS: ReadonlySet<string> = new Set();

/**
 * The reader's chat safety state (App Store guideline 1.2): their block list
 * and whether they accepted the chat agreement, both loaded once per user
 * through the chat API (the Firestore rules keep blocks server-only), plus the
 * report / block / unblock / accept calls. A failed load leaves the block list
 * empty and termsAccepted null, so chat keeps working and nobody is gated on a
 * network hiccup.
 */
export function useChatSafety(uid: string | null | undefined, authedFetch: AuthedFetch): ChatSafety {
  const [loaded, setLoaded] = useState<{ uid: string; blocked: Set<string>; termsAccepted: boolean | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const [blocks, terms] = await Promise.all([
        authedFetch('/api/portal/chat/blocks')
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
        authedFetch('/api/portal/chat/terms')
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ]);
      if (cancelled) return;
      const blocked = new Set<string>(
        Array.isArray(blocks?.blocked)
          ? blocks.blocked.map((entry: { uid?: unknown }) => entry.uid).filter((id: unknown): id is string => typeof id === 'string')
          : []
      );
      const termsAccepted = terms && 'acceptedAt' in terms ? typeof terms.acceptedAt === 'string' : null;
      setLoaded({ uid, blocked, termsAccepted });
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, authedFetch]);

  const current = uid && loaded?.uid === uid ? loaded : null;

  const acceptTerms = useCallback(async () => {
    const res = await authedFetch('/api/portal/chat/terms', { method: 'POST' });
    if (!res.ok) throw await errorFrom(res, "Couldn't save. Try again.");
    setLoaded((prev) => (prev ? { ...prev, termsAccepted: true } : prev));
  }, [authedFetch]);

  const requireTerms = useCallback(() => {
    if (!uid) return;
    setLoaded((prev) =>
      prev && prev.uid === uid
        ? { ...prev, termsAccepted: false }
        : { uid, blocked: prev?.uid === uid ? prev.blocked : new Set<string>(), termsAccepted: false }
    );
  }, [uid]);

  const block = useCallback(
    async (target: string) => {
      const res = await authedFetch('/api/portal/chat/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: target }),
      });
      if (!res.ok) throw await errorFrom(res, "Couldn't block. Try again.");
      const body = await res.json().catch(() => ({}));
      setLoaded((prev) => (prev ? { ...prev, blocked: new Set(prev.blocked).add(target) } : prev));
      return typeof body.name === 'string' ? body.name : '';
    },
    [authedFetch]
  );

  const unblock = useCallback(
    async (target: string) => {
      const res = await authedFetch('/api/portal/chat/blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: target }),
      });
      if (!res.ok) throw await errorFrom(res, "Couldn't unblock. Try again.");
      setLoaded((prev) => {
        if (!prev) return prev;
        const blocked = new Set(prev.blocked);
        blocked.delete(target);
        return { ...prev, blocked };
      });
    },
    [authedFetch]
  );

  const report = useCallback(
    async (input: { channelId: string; messageId: string; reason: ReportReason }) => {
      const res = await authedFetch('/api/portal/chat/messages/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await errorFrom(res, "Couldn't send the report. Try again.");
    },
    [authedFetch]
  );

  const blockedUids = current?.blocked ?? NO_BLOCKS;
  const termsAccepted = current?.termsAccepted ?? null;
  return useMemo(
    () => ({ blockedUids, termsAccepted, acceptTerms, requireTerms, block, unblock, report }),
    [blockedUids, termsAccepted, acceptTerms, requireTerms, block, unblock, report]
  );
}
