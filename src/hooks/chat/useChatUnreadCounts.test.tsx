// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatChannelDoc } from './useChatChannels';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Pending = { channelId: string; resolve: (count: number) => void; reject: () => void };
const pending = vi.hoisted(() => [] as Pending[]);

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, _root: string, channelId: string) => ({ channelId }),
  where: () => ({}),
  limit: () => ({}),
  query: (col: { channelId: string }) => col,
  Timestamp: { fromDate: (d: Date) => d },
  getCountFromServer: (q: { channelId: string }) =>
    new Promise((resolve, reject) => {
      pending.push({
        channelId: q.channelId,
        resolve: (count) => resolve({ data: () => ({ count }) }),
        reject: () => reject(new Error('offline')),
      });
    }),
}));

import { useChatUnreadCounts } from './useChatUnreadCounts';

let container: HTMLDivElement;
let root: Root;
let latest: Record<string, number> = {};

function Probe(props: {
  channels: ChatChannelDoc[];
  unread: Record<string, boolean>;
  reads: Record<string, Date | null>;
  report: (counts: Record<string, number>) => void;
}) {
  const counts = useChatUnreadCounts(props.channels, props.unread, props.reads);
  props.report(counts);
  return null;
}
const report = (counts: Record<string, number>) => {
  latest = counts;
};

const t = (ms: number) => new Date(ms);
const channel = (id: string, at: number) => ({ id, name: id, lastMessageAt: t(at) }) as ChatChannelDoc;

function render(channels: ChatChannelDoc[], unread: Record<string, boolean>, reads: Record<string, Date | null> = {}) {
  act(() => root.render(<Probe channels={channels} unread={unread} reads={reads} report={report} />));
}

async function settle(index: number, count: number) {
  await act(async () => {
    pending[index].resolve(count);
    await Promise.resolve();
  });
}

beforeEach(() => {
  pending.length = 0;
  latest = {};
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useChatUnreadCounts', () => {
  it('counts unread channels only, once per change', async () => {
    render([channel('a', 10), channel('b', 20)], { a: true, b: false });
    expect(pending.map((p) => p.channelId)).toEqual(['a']);
    await settle(0, 3);
    expect(latest).toEqual({ a: 3 });

    // Same data in new arrays: no new count.
    render([channel('a', 10), channel('b', 20)], { a: true, b: false });
    expect(pending).toHaveLength(1);

    // A new message in a: re-counted, and the old count isn't shown meanwhile.
    render([channel('a', 11), channel('b', 20)], { a: true, b: false });
    expect(pending).toHaveLength(2);
    expect(latest).toEqual({});
    await settle(1, 4);
    expect(latest).toEqual({ a: 4 });
  });

  it('keeps an in-flight count when another channel changes meanwhile', async () => {
    render([channel('a', 10), channel('b', 20)], { a: true, b: false });
    render([channel('a', 10), channel('b', 21)], { a: true, b: true });
    expect(pending.map((p) => p.channelId)).toEqual(['a', 'b']);
    await settle(0, 2);
    await settle(1, 7);
    expect(latest).toEqual({ a: 2, b: 7 });
  });

  it('drops a count that arrives after its channel moved on', async () => {
    render([channel('a', 10)], { a: true });
    render([channel('a', 11)], { a: true });
    await settle(0, 1);
    expect(latest).toEqual({});
    await settle(1, 2);
    expect(latest).toEqual({ a: 2 });
  });

  it('shows nothing (the dot) when a count fails or the channel is read', async () => {
    render([channel('a', 10)], { a: true });
    await act(async () => {
      pending[0].reject();
      await Promise.resolve();
    });
    expect(latest).toEqual({});
    render([channel('a', 10)], { a: false });
    expect(latest).toEqual({});
  });
});
