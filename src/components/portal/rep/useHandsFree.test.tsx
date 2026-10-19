// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandsFreeMic } from './handsFreeMic';

const fake = vi.hoisted(() => ({
  opens: [] as Array<{ resolve(mic: HandsFreeMic | null): void; mic: { finish: () => void; close: ReturnType<typeof vi.fn<() => void>> } }>,
}));

vi.mock('./handsFreeMic', () => ({
  openHandsFreeMic: () => {
    const pending = Promise.withResolvers<HandsFreeMic | null>();
    fake.opens.push({ resolve: pending.resolve, mic: { finish: vi.fn<() => void>(), close: vi.fn<() => void>() } });
    return pending.promise;
  },
}));

import { useHandsFree, type HandsFreeHandlers } from './useHandsFree';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const handlers: HandsFreeHandlers<string> = {
  onLine: vi.fn(),
  speculate: vi.fn(),
  dropSpeculation: vi.fn(),
  prepareCut: vi.fn(async () => null),
  cut: vi.fn(),
  bargeIn: vi.fn(),
  onLost: vi.fn(),
};

let hands: ReturnType<typeof useHandsFree<string>>;
function Capture() {
  const value = useHandsFree(handlers);
  useEffect(() => {
    hands = value;
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;
const lock = { release: vi.fn(async () => {}) };
const context = {} as AudioContext;
const stream = Promise.resolve({} as MediaStream);

beforeEach(() => {
  fake.opens = [];
  lock.release.mockClear();
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(async () => lock) },
  });
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root.render(<Capture />));
});

afterEach(() => {
  act(() => root.unmount());
});

/** Lets the opened mic land and the wake lock's promise settle. */
async function settle(open: (typeof fake.opens)[number], mic: HandsFreeMic | null = open.mic) {
  await act(async () => {
    open.resolve(mic);
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('useHandsFree start racing a stop', () => {
  it('closes a mic that opens after End was tapped, and holds no wake lock', async () => {
    let started: Promise<boolean> | undefined;
    act(() => {
      started = hands.start(context, stream, 'listening');
    });
    expect(hands.status).toBe('starting');
    act(() => hands.stop());
    await settle(fake.opens[0]);
    expect(fake.opens[0].mic.close).toHaveBeenCalled();
    expect(await started).toBe(false);
    expect(hands.status).toBe('off');
    expect(navigator.wakeLock.request).not.toHaveBeenCalled();
  });

  it('closes a mic that opens after the page unmounted', async () => {
    act(() => {
      void hands.start(context, stream, 'listening');
    });
    act(() => root.unmount());
    await settle(fake.opens[0]);
    expect(fake.opens[0].mic.close).toHaveBeenCalled();
    // afterEach unmounts again; give it something to unmount.
    root = createRoot(container);
  });

  it('pausing while the mic opens closes it and leaves hands-free paused', async () => {
    act(() => {
      void hands.start(context, stream, 'listening');
    });
    act(() => hands.pause());
    expect(hands.status).toBe('paused');
    await settle(fake.opens[0]);
    expect(fake.opens[0].mic.close).toHaveBeenCalled();
    expect(hands.status).toBe('paused');
  });

  it('a second Knock while the first mic opens keeps only the second', async () => {
    act(() => {
      void hands.start(context, stream, 'listening');
    });
    act(() => {
      void hands.start(context, stream, 'thinking');
    });
    await settle(fake.opens[1]);
    expect(hands.status).toBe('thinking');
    await settle(fake.opens[0]);
    expect(fake.opens[0].mic.close).toHaveBeenCalled();
    expect(fake.opens[1].mic.close).not.toHaveBeenCalled();
    expect(hands.status).toBe('thinking');
    act(() => hands.stop());
    expect(fake.opens[1].mic.close).toHaveBeenCalled();
  });

  it('releases a wake lock that arrives after the stop', async () => {
    const late = Promise.withResolvers<typeof lock>();
    (navigator.wakeLock.request as ReturnType<typeof vi.fn>).mockReturnValueOnce(late.promise);
    act(() => {
      void hands.start(context, stream, 'listening');
    });
    await settle(fake.opens[0]);
    expect(hands.status).toBe('listening');
    act(() => hands.stop());
    await act(async () => {
      late.resolve(lock);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(lock.release).toHaveBeenCalled();
  });

  it('a start left alone still opens and listens', async () => {
    act(() => {
      void hands.start(context, stream, 'listening');
    });
    await settle(fake.opens[0]);
    expect(fake.opens[0].mic.close).not.toHaveBeenCalled();
    expect(hands.status).toBe('listening');
  });
});
