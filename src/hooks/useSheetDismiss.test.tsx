// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseVelocity, sheetDimFor, shouldDismissSheet, useSheetDismiss } from './useSheetDismiss';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('releaseVelocity', () => {
  it('is 0 without two samples', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ y: 10, t: 0 }])).toBe(0);
  });

  it('measures the last 100ms only', () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 10, t: 400 },
      { y: 20, t: 450 },
      { y: 70, t: 500 },
    ];
    // From t=400 to t=500: 60px in 100ms.
    expect(releaseVelocity(samples)).toBeCloseTo(0.6);
  });

  it('is negative for a drag moving back up', () => {
    expect(releaseVelocity([{ y: 100, t: 0 }, { y: 80, t: 40 }])).toBeCloseTo(-0.5);
  });
});

describe('shouldDismissSheet', () => {
  const height = 600;

  it('springs back from a short, slow drag', () => {
    expect(shouldDismissSheet({ distance: 80, velocity: 0.1, height })).toBe(false);
  });

  it('closes past a third of the height (capped at 200px)', () => {
    expect(shouldDismissSheet({ distance: 199, velocity: 0, height: 900 })).toBe(false);
    expect(shouldDismissSheet({ distance: 200, velocity: 0, height: 900 })).toBe(true);
    expect(shouldDismissSheet({ distance: 100, velocity: 0, height: 300 })).toBe(true);
  });

  it('closes on a flick, even from a short drag', () => {
    expect(shouldDismissSheet({ distance: 40, velocity: 0.8, height })).toBe(true);
  });

  it('never closes on tap jitter, however fast', () => {
    expect(shouldDismissSheet({ distance: 8, velocity: 2, height })).toBe(false);
  });

  it('springs back when the finger was moving up at release', () => {
    expect(shouldDismissSheet({ distance: 260, velocity: -0.4, height })).toBe(false);
  });

  it('never closes from an upward drag', () => {
    expect(shouldDismissSheet({ distance: -50, velocity: 1, height })).toBe(false);
  });
});

describe('sheetDimFor', () => {
  it('fades the dim with the drag', () => {
    expect(sheetDimFor(0, 400)).toBe(1);
    expect(sheetDimFor(100, 400)).toBe(0.75);
    expect(sheetDimFor(800, 400)).toBe(0);
  });
});

describe('useSheetDismiss', () => {
  let container: HTMLDivElement;
  let root: Root;
  let reduced = false;
  const onClose = vi.fn();
  let api: ReturnType<typeof useSheetDismiss<HTMLElement>> | null = null;

  function Sheet() {
    const sheet = useSheetDismiss<HTMLElement>(onClose);
    const { backdropRef, sheetRef, closing } = sheet;
    // Exposed after commit, not during render (no side effects in render).
    useEffect(() => {
      api = sheet;
    });
    return (
      <div ref={backdropRef} id="backdrop" data-closing={closing || undefined}>
        <section ref={sheetRef} id="sheet" data-closing={closing || undefined}>
          <div id="body">content</div>
          <div id="row" style={{ overflowX: 'auto' }}>
            <span id="chip">chip</span>
          </div>
        </section>
      </div>
    );
  }

  const sheetEl = () => document.getElementById('sheet') as HTMLElement;

  function touch(type: string, y: number, t: number, x = 100, targetId = 'body') {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const point = { clientX: x, clientY: y };
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [point] });
    Object.defineProperty(event, 'changedTouches', { value: [point] });
    Object.defineProperty(event, 'timeStamp', { value: t });
    document.getElementById(targetId)!.dispatchEvent(event);
    return event;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    reduced = false;
    onClose.mockReset();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce') ? reduced : false,
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Sheet />));
    sheetEl().getBoundingClientRect = () => ({ height: 600 }) as DOMRect;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    api = null;
  });

  it('plays the exit before calling onClose', async () => {
    await act(async () => api!.close());
    expect(sheetEl().hasAttribute('data-closing')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(180));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once, however often it is asked', async () => {
    await act(async () => {
      api!.close();
      api!.close();
    });
    await act(async () => vi.advanceTimersByTime(180));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once with reduced motion', async () => {
    reduced = true;
    await act(async () => api!.close());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('comes back when the parent keeps it open', async () => {
    await act(async () => api!.close());
    await act(async () => vi.advanceTimersByTime(181));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sheetEl().hasAttribute('data-closing')).toBe(false);
  });

  it('follows a drag down and closes when let go far enough', async () => {
    await act(async () => {
      touch('touchstart', 100, 0);
      touch('touchmove', 140, 50);
    });
    const move = await act(async () => touch('touchmove', 340, 400));
    expect(move.defaultPrevented).toBe(true);
    expect(sheetEl().style.transform).toBe('translate3d(0, 240px, 0)');
    expect(document.getElementById('backdrop')!.style.getPropertyValue('--sheet-dim')).toBe('0.6');
    await act(async () => touch('touchend', 340, 500));
    expect(sheetEl().hasAttribute('data-closing')).toBe(true);
    await act(async () => vi.advanceTimersByTime(180));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('springs back from a short, slow drag', async () => {
    await act(async () => {
      touch('touchstart', 100, 0);
      touch('touchmove', 140, 200);
      touch('touchmove', 160, 400);
      touch('touchend', 160, 600);
    });
    expect(sheetEl().style.transform).toBe('');
    expect(sheetEl().hasAttribute('data-closing')).toBe(false);
    await act(async () => vi.advanceTimersByTime(500));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves an upward swipe to the scroller', async () => {
    await act(async () => {
      touch('touchstart', 300, 0);
    });
    const move = await act(async () => touch('touchmove', 200, 50));
    expect(move.defaultPrevented).toBe(false);
    expect(sheetEl().style.transform).toBe('');
  });

  it('does not drag a body that is scrolled down', async () => {
    const body = document.getElementById('body')!;
    Object.defineProperty(body, 'scrollTop', { configurable: true, value: 120 });
    await act(async () => {
      touch('touchstart', 100, 0);
    });
    const move = await act(async () => touch('touchmove', 200, 50));
    expect(move.defaultPrevented).toBe(false);
    expect(sheetEl().style.transform).toBe('');
  });

  it('holds the bounce off from the first small downward move at the top', async () => {
    await act(async () => {
      touch('touchstart', 100, 0);
    });
    const first = await act(async () => touch('touchmove', 103, 10));
    expect(first.defaultPrevented).toBe(true);
    // Not decided yet: nothing moves until the 6px threshold.
    expect(sheetEl().style.transform).toBe('');
  });

  it('listens for moves only while a drag can begin', async () => {
    const sheet = sheetEl();
    const add = vi.spyOn(sheet, 'addEventListener');
    const remove = vi.spyOn(sheet, 'removeEventListener');
    await act(async () => {
      touch('touchstart', 100, 0);
    });
    expect(add.mock.calls.filter(([type]) => type === 'touchmove')).toHaveLength(1);
    await act(async () => {
      touch('touchend', 100, 20);
    });
    expect(remove.mock.calls.filter(([type]) => type === 'touchmove')).toHaveLength(1);
    const body = document.getElementById('body')!;
    Object.defineProperty(body, 'scrollTop', { configurable: true, value: 120 });
    await act(async () => {
      touch('touchstart', 100, 30);
    });
    expect(add.mock.calls.filter(([type]) => type === 'touchmove')).toHaveLength(1);
  });

  it('leaves a diagonal start alone so it can still scroll', async () => {
    await act(async () => {
      touch('touchstart', 100, 0, 100);
    });
    // 2px down, 2px across: not clearly vertical yet.
    const first = await act(async () => touch('touchmove', 102, 10, 102));
    expect(first.defaultPrevented).toBe(false);
    // 5px down, 4px across: more down than across, but not twice as much.
    const second = await act(async () => touch('touchmove', 105, 20, 104));
    expect(second.defaultPrevented).toBe(false);
    // Decided (past 6px) as a diagonal: never claimed, nothing moves.
    const third = await act(async () => touch('touchmove', 120, 30, 110));
    expect(third.defaultPrevented).toBe(false);
    expect(sheetEl().style.transform).toBe('');
  });

  it('does not hold the bounce off for a 1-2px downward wobble', async () => {
    await act(async () => {
      touch('touchstart', 100, 0);
    });
    const first = await act(async () => touch('touchmove', 102, 10));
    expect(first.defaultPrevented).toBe(false);
  });

  it('never takes a touch that starts in a horizontal scroller', async () => {
    const row = document.getElementById('row')!;
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 300 });
    await act(async () => {
      touch('touchstart', 100, 0, 100, 'chip');
    });
    const first = await act(async () => touch('touchmove', 104, 10, 100, 'chip'));
    expect(first.defaultPrevented).toBe(false);
    const drag = await act(async () => touch('touchmove', 300, 50, 100, 'chip'));
    expect(drag.defaultPrevented).toBe(false);
    expect(sheetEl().style.transform).toBe('');
  });

  it('still drags from a row that does not overflow', async () => {
    await act(async () => {
      touch('touchstart', 100, 0, 100, 'chip');
      touch('touchmove', 140, 50, 100, 'chip');
    });
    const move = await act(async () => touch('touchmove', 200, 100, 100, 'chip'));
    expect(move.defaultPrevented).toBe(true);
    expect(sheetEl().style.transform).toBe('translate3d(0, 100px, 0)');
  });
});
