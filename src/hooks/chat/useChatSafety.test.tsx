// @vitest-environment jsdom
//
// The block list is the only thing hiding a blocked person's messages on the
// chat screen (App Store 1.2), and the agreement gate must not come back right
// after an accept. Late or failed loads must not undo either.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blocksRetryDelay, MAX_BLOCKS_RETRIES, useChatSafety, type ChatSafety } from './useChatSafety';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Deferred {
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** GETs wait until the test answers them; POST/DELETE answer at once. */
let pending: Record<string, Deferred[]>;
let calls: string[];
const authedFetch = vi.fn((url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  calls.push(`${method} ${url}`);
  if (method !== 'GET') return Promise.resolve(json({ ok: true, name: 'Pat' }));
  return new Promise<Response>((resolve, reject) => {
    (pending[url] ??= []).push({ resolve, reject });
  });
});

async function answer(url: string, res: Response | Error) {
  const next = pending[url]?.shift();
  if (!next) throw new Error(`no pending GET ${url}`);
  await act(async () => {
    if (res instanceof Error) next.reject(res);
    else next.resolve(res);
  });
}

let latest: ChatSafety;
function Probe({ uid }: { uid: string }) {
  const value = useChatSafety(uid, authedFetch);
  useEffect(() => {
    latest = value;
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  pending = {};
  calls = [];
  authedFetch.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Probe uid="me" />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useChatSafety', () => {
  it('loads the block list and agreement state', async () => {
    await answer('/api/portal/chat/blocks', json({ blocked: [{ uid: 'x' }] }));
    await answer('/api/portal/chat/terms', json({ acceptedAt: '2026-10-01T00:00:00.000Z' }));
    expect([...latest.blockedUids]).toEqual(['x']);
    expect(latest.termsAccepted).toBe(true);
  });

  it('keeps an accept made while the first terms load was in flight', async () => {
    act(() => latest.requireTerms());
    expect(latest.termsAccepted).toBe(false);
    await act(async () => latest.acceptTerms());
    expect(latest.termsAccepted).toBe(true);
    // The GET was answered before the POST was saved: no acceptedAt.
    await answer('/api/portal/chat/terms', json({ acceptedAt: null }));
    await answer('/api/portal/chat/blocks', json({ blocked: [] }));
    expect(latest.termsAccepted).toBe(true);
  });

  it('keeps a block made before the first block-list load lands', async () => {
    await act(async () => {
      await expect(latest.block('x')).resolves.toBe('Pat');
    });
    expect(latest.blockedUids.has('x')).toBe(true);
    // The stale list (served before the POST committed) lands afterwards.
    await answer('/api/portal/chat/blocks', json({ blocked: [{ uid: 'y' }] }));
    expect([...latest.blockedUids].sort()).toEqual(['x', 'y']);
  });

  it('keeps an unblock made before the first block-list load lands', async () => {
    await act(async () => latest.unblock('x'));
    await answer('/api/portal/chat/blocks', json({ blocked: [{ uid: 'x' }, { uid: 'y' }] }));
    expect([...latest.blockedUids]).toEqual(['y']);
  });

  it('retries a failed block-list load until it succeeds', async () => {
    await answer('/api/portal/chat/blocks', new Error('offline'));
    expect(latest.blockedUids.size).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(blocksRetryDelay(0));
    });
    await answer('/api/portal/chat/blocks', json({ error: 'boom' }, 500));
    await act(async () => {
      vi.advanceTimersByTime(blocksRetryDelay(1));
    });
    await answer('/api/portal/chat/blocks', json({ blocked: [{ uid: 'x' }] }));
    expect(latest.blockedUids.has('x')).toBe(true);
    // Loaded: no more retries.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(calls.filter((c) => c === 'GET /api/portal/chat/blocks')).toHaveLength(3);
  });

  it('retries the block-list load as soon as the device is back online', async () => {
    await answer('/api/portal/chat/blocks', new Error('offline'));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await answer('/api/portal/chat/blocks', json({ blocked: [{ uid: 'x' }] }));
    expect(latest.blockedUids.has('x')).toBe(true);
  });

  it.each([401, 403])('never retries the block-list load after a %i', async (status) => {
    await answer('/api/portal/chat/blocks', json({ error: 'no' }, status));
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(calls.filter((c) => c === 'GET /api/portal/chat/blocks')).toHaveLength(1);
    expect(pending['/api/portal/chat/blocks'] ?? []).toHaveLength(0);
  });

  it('stops the timed retries after MAX_BLOCKS_RETRIES, then retries again when back online', async () => {
    for (let attempt = 0; attempt < MAX_BLOCKS_RETRIES; attempt += 1) {
      await answer('/api/portal/chat/blocks', json({ error: 'boom' }, 500));
      await act(async () => {
        vi.advanceTimersByTime(blocksRetryDelay(attempt));
      });
    }
    await answer('/api/portal/chat/blocks', json({ error: 'boom' }, 500));
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    const blockGets = () => calls.filter((c) => c === 'GET /api/portal/chat/blocks').length;
    expect(blockGets()).toBe(MAX_BLOCKS_RETRIES + 1);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(blockGets()).toBe(MAX_BLOCKS_RETRIES + 2);
    await answer('/api/portal/chat/blocks', json({ blocked: [{ uid: 'x' }] }));
    expect(latest.blockedUids.has('x')).toBe(true);
  });

  it('a failed terms load leaves the agreement unknown (nobody is gated)', async () => {
    await answer('/api/portal/chat/terms', new Error('offline'));
    await answer('/api/portal/chat/blocks', json({ blocked: [] }));
    expect(latest.termsAccepted).toBeNull();
  });

  it('caps the retry delay', () => {
    expect(blocksRetryDelay(0)).toBe(2_000);
    expect(blocksRetryDelay(10)).toBe(30_000);
  });
});
