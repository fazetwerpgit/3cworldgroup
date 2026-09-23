// @vitest-environment jsdom
//
// The money count-up: 0 to the value once per session per surface, landing on
// the exact value; reduced motion, a spent flag or blocked storage show the
// value outright, and a data refresh never counts again.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountUp, type CountUpOptions } from './useCountUp';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let now = 0;
let frames: Array<(time: number) => void> = [];
let reduce = false;

function Num({ value, options }: { value: number; options?: CountUpOptions }) {
  return <>{useCountUp(value, options)}</>;
}

async function render(value: number, options?: CountUpOptions) {
  await act(async () => root.render(<Num value={value} options={options} />));
}

/** Runs animation frames until the clock passes `ms`. */
async function advance(ms: number) {
  const end = now + ms;
  while (now < end && frames.length) {
    now = Math.min(end, now + 16);
    const due = frames;
    frames = [];
    await act(async () => due.forEach((cb) => cb(now)));
  }
}

const shown = () => container.textContent;

beforeEach(() => {
  now = 0;
  frames = [];
  reduce = false;
  window.sessionStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  window.matchMedia = ((query: string) => ({ matches: reduce, media: query }) as MediaQueryList);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCountUp', () => {
  it('counts from 0 and lands on the exact value', async () => {
    await render(4837, { sessionKey: 'k' });
    expect(shown()).toBe('0');
    await advance(300);
    const mid = Number(shown());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(4837);
    await advance(400);
    expect(shown()).toBe('4837');
    expect(frames).toHaveLength(0);
  });

  it('shows the value outright under reduced motion, and leaves the flag unset', async () => {
    reduce = true;
    await render(4837, { sessionKey: 'k' });
    expect(shown()).toBe('4837');
    expect(frames).toHaveLength(0);
    expect(window.sessionStorage.getItem('k')).toBeNull();
  });

  it('counts once per session per surface', async () => {
    await render(4837, { sessionKey: 'home' });
    expect(window.sessionStorage.getItem('home')).toBe('1');
    await advance(700);
    await act(async () => root.unmount());
    root = createRoot(container);

    await render(4837, { sessionKey: 'home' });
    expect(shown()).toBe('4837');
    expect(frames).toHaveLength(0);

    await act(async () => root.unmount());
    root = createRoot(container);
    await render(1200, { sessionKey: 'sales' });
    expect(shown()).toBe('0');
  });

  it('shows the value outright when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await render(4837, { sessionKey: 'k' });
    expect(shown()).toBe('4837');
    expect(frames).toHaveLength(0);
  });

  it('does not count again on a data refresh', async () => {
    await render(4837, { sessionKey: 'k' });
    await advance(700);
    await render(5210, { sessionKey: 'k' });
    expect(shown()).toBe('5210');
    expect(frames).toHaveLength(0);
  });

  it('jumps to a refreshed value mid-count', async () => {
    await render(4837, { sessionKey: 'k' });
    await advance(200);
    await render(5210, { sessionKey: 'k' });
    expect(shown()).toBe('5210');
    await advance(600);
    expect(shown()).toBe('5210');
  });
});
