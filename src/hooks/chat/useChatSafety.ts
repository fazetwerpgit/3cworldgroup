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

/** Wait before retrying a failed block-list load: 2s, 4s, 8s ... capped at 30s. */
export function blocksRetryDelay(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** attempt);
}

/**
 * Timed retries after a failed block-list load (about 3.5 minutes in all with
 * the delays above). After that only the device coming back online tries
 * again, and that starts a fresh round.
 */
export const MAX_BLOCKS_RETRIES = 8;

/** One block-list load: the list, an auth refusal (401/403, never retried), or a failure worth retrying. */
type BlocksLoad = { kind: 'ok'; blocked: Set<string> } | { kind: 'denied' } | { kind: 'failed' };

/** What the server said when the page loaded. blocked is null until the list loads. */
interface ServerState {
  uid: string;
  blocked: ReadonlySet<string> | null;
  termsAccepted: boolean | null;
}

/**
 * Changes the reader made on this page. They are newer than any load, so they
 * win over a load that lands after them: an accept is not undone by a late
 * GET /terms, and a block is not dropped by a late GET /blocks.
 */
interface LocalChanges {
  uid: string;
  terms: boolean | null;
  /** uid -> true (blocked here) or false (unblocked here). */
  blocks: ReadonlyMap<string, boolean>;
}

function parseBlocked(body: unknown): Set<string> | null {
  const list = (body as { blocked?: unknown } | null)?.blocked;
  if (!Array.isArray(list)) return null;
  return new Set(
    list.map((entry: { uid?: unknown } | null) => entry?.uid).filter((id: unknown): id is string => typeof id === 'string')
  );
}

/**
 * The reader's chat safety state (App Store guideline 1.2): their block list
 * and whether they accepted the chat agreement, loaded through the chat API
 * (the Firestore rules keep blocks server-only), plus the report / block /
 * unblock / accept calls. A failed terms load leaves termsAccepted null, so
 * nobody is gated on a network hiccup. A failed block-list load is retried
 * (with capped backoff, and as soon as the device is back online; never on a
 * 401/403), because the block
 * list is the only thing that hides blocked people's messages on this screen.
 * Blocks, unblocks and accepts made on this page win over a load that lands
 * after them.
 */
export function useChatSafety(uid: string | null | undefined, authedFetch: AuthedFetch): ChatSafety {
  const [server, setServer] = useState<ServerState | null>(null);
  const [local, setLocal] = useState<LocalChanges | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let loading = false;
    // Loaded, or refused for auth: either way this effect never asks again.
    let blocksDone = false;

    const fetchBlocks = (): Promise<BlocksLoad> =>
      authedFetch('/api/portal/chat/blocks')
        .then(async (res): Promise<BlocksLoad> => {
          if (res.status === 401 || res.status === 403) return { kind: 'denied' };
          if (!res.ok) return { kind: 'failed' };
          const blocked = parseBlocked(await res.json().catch(() => null));
          return blocked ? { kind: 'ok', blocked } : { kind: 'failed' };
        })
        .catch((): BlocksLoad => ({ kind: 'failed' }));

    const loadBlocks = async () => {
      if (cancelled || blocksDone || loading) return;
      loading = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const result = await fetchBlocks();
      loading = false;
      if (cancelled) return;
      if (result.kind === 'ok') {
        blocksDone = true;
        const { blocked } = result;
        setServer((prev) => ({ uid, termsAccepted: prev?.uid === uid ? prev.termsAccepted : null, blocked }));
        return;
      }
      // A 401/403 will not fix itself by asking again (signed out, or no chat
      // access): stop instead of polling the route for the life of the page.
      if (result.kind === 'denied') {
        blocksDone = true;
        return;
      }
      if (attempt >= MAX_BLOCKS_RETRIES) return;
      retryTimer = setTimeout(() => void loadBlocks(), blocksRetryDelay(attempt));
      attempt += 1;
    };
    const onOnline = () => {
      // Back online: a fresh round of retries.
      attempt = 0;
      void loadBlocks();
    };

    void loadBlocks();
    void authedFetch('/api/portal/chat/terms')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((terms) => {
        if (cancelled) return;
        const termsAccepted = terms && 'acceptedAt' in terms ? typeof terms.acceptedAt === 'string' : null;
        setServer((prev) => ({ uid, blocked: prev?.uid === uid ? prev.blocked : null, termsAccepted }));
      });
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('online', onOnline);
    };
  }, [uid, authedFetch]);

  /** Record a change the reader made, for the user it was made as. */
  const change = useCallback((forUid: string, apply: (prev: LocalChanges) => LocalChanges) => {
    setLocal((prev) => apply(prev && prev.uid === forUid ? prev : { uid: forUid, terms: null, blocks: new Map() }));
  }, []);

  const acceptTerms = useCallback(async () => {
    const forUid = uid;
    const res = await authedFetch('/api/portal/chat/terms', { method: 'POST' });
    if (!res.ok) throw await errorFrom(res, "Couldn't save. Try again.");
    if (forUid) change(forUid, (prev) => ({ ...prev, terms: true }));
  }, [uid, authedFetch, change]);

  const requireTerms = useCallback(() => {
    if (!uid) return;
    change(uid, (prev) => ({ ...prev, terms: false }));
  }, [uid, change]);

  const block = useCallback(
    async (target: string) => {
      const forUid = uid;
      const res = await authedFetch('/api/portal/chat/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: target }),
      });
      if (!res.ok) throw await errorFrom(res, "Couldn't block. Try again.");
      const body = await res.json().catch(() => ({}));
      if (forUid) change(forUid, (prev) => ({ ...prev, blocks: new Map(prev.blocks).set(target, true) }));
      return typeof body.name === 'string' ? body.name : '';
    },
    [uid, authedFetch, change]
  );

  const unblock = useCallback(
    async (target: string) => {
      const forUid = uid;
      const res = await authedFetch('/api/portal/chat/blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: target }),
      });
      if (!res.ok) throw await errorFrom(res, "Couldn't unblock. Try again.");
      if (forUid) change(forUid, (prev) => ({ ...prev, blocks: new Map(prev.blocks).set(target, false) }));
    },
    [uid, authedFetch, change]
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

  const serverNow = uid && server?.uid === uid ? server : null;
  const localNow = uid && local?.uid === uid ? local : null;
  const serverBlocked = serverNow?.blocked ?? null;
  const localBlocks = localNow?.blocks ?? null;
  const blockedUids = useMemo<ReadonlySet<string>>(() => {
    if (!localBlocks || localBlocks.size === 0) return serverBlocked ?? NO_BLOCKS;
    const merged = new Set(serverBlocked ?? NO_BLOCKS);
    for (const [target, isBlocked] of localBlocks) {
      if (isBlocked) merged.add(target);
      else merged.delete(target);
    }
    return merged;
  }, [serverBlocked, localBlocks]);
  const termsAccepted = localNow?.terms ?? serverNow?.termsAccepted ?? null;
  return useMemo(
    () => ({ blockedUids, termsAccepted, acceptTerms, requireTerms, block, unblock, report }),
    [blockedUids, termsAccepted, acceptTerms, requireTerms, block, unblock, report]
  );
}
