// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/app/bridge', () => ({ nativeHaptic: vi.fn() }));

import { onRevalidateDataCache } from '@/lib/cache/dataCache';
import { PullToRefresh } from './PullToRefresh';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Shell({ pathname }: { pathname: string }) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  return (
    <main id="scroller" ref={scrollerRef}>
      <PullToRefresh scrollerRef={scrollerRef} contentRef={contentRef} pathname={pathname} />
      <div id="content" ref={contentRef} />
    </main>
  );
}

function touch(type: string, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: 100, clientY: y };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [point] });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  document.getElementById('content')!.dispatchEvent(event);
  return event;
}

const state = () => document.querySelector('[data-state]')?.getAttribute('data-state');
const content = () => document.getElementById('content')!;

describe('PullToRefresh', () => {
  let container: HTMLDivElement;
  let root: Root;
  let unregister: (() => void) | null = null;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width') }));
    // A refetch that never lands, so the refresh is still spinning when we leave.
    unregister = onRevalidateDataCache(() => new Promise(() => undefined));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Shell pathname="/portal" />));
  });

  afterEach(() => {
    unregister?.();
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function pullAndRelease() {
    await act(async () => {
      touch('touchstart', 0);
      touch('touchmove', 20);
      touch('touchmove', 300);
      touch('touchend', 300);
    });
  }

  it('refreshes past the threshold and holds the content down', async () => {
    await pullAndRelease();
    expect(state()).toBe('refreshing');
    expect(content().style.transform).toContain('translate3d');
  });

  it('settles at once when the route changes mid-refresh', async () => {
    await pullAndRelease();
    expect(state()).toBe('refreshing');
    await act(async () => root.render(<Shell pathname="/portal/sales" />));
    expect(state()).toBe('idle');
    expect(content().style.transform).toBe('');
  });

  it('settles at once when the refreshing screen unmounts', async () => {
    await pullAndRelease();
    await act(async () => {
      unregister?.();
      unregister = null;
    });
    expect(state()).toBe('idle');
    expect(content().style.transform).toBe('');
  });

  it('attaches the blocking touchmove only for a touch at the top', async () => {
    const scroller = document.getElementById('scroller')!;
    const add = vi.spyOn(scroller, 'addEventListener');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 200 });
    await act(async () => {
      touch('touchstart', 0);
    });
    expect(add.mock.calls.some(([type]) => type === 'touchmove')).toBe(false);
  });
});
