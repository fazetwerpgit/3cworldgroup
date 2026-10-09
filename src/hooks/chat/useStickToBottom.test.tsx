// @vitest-environment jsdom
//
// Stick-to-bottom for the chat scroller: positioning is scoped to the scroller
// (never scrollIntoView, which also scrolls the installed app's shell), and late
// layout changes re-pin a reader at the bottom without fighting one scrolled up.
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STICK_THRESHOLD_PX, useStickToBottom } from './useStickToBottom';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Entry = { target: Element; contentRect: { height: number } };

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed = new Set<Element>();
  constructor(public callback: (entries: Entry[]) => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.observed.add(target);
  }
  unobserve(target: Element) {
    this.observed.delete(target);
  }
  disconnect() {
    this.observed.clear();
  }
  fire(entries: Entry[]) {
    this.callback(entries);
  }
}

// A scroller whose geometry the test controls (jsdom has no layout).
function geometry(el: HTMLElement, init: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const state = { ...init };
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => state.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => state.clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = Math.max(0, Math.min(value, state.scrollHeight - state.clientHeight));
    },
  });
  return state;
}

let api: ReturnType<typeof useStickToBottom>;
let scroller: HTMLDivElement;

function Harness() {
  const ref = useRef<HTMLDivElement | null>(null);
  const stick = useStickToBottom(ref);
  useEffect(() => {
    api = stick;
  });
  return (
    <div
      ref={(node) => {
        ref.current = node;
        if (node) scroller = node;
      }}
      onScroll={stick.onScroll}
    >
      <div data-row="1" />
      <div data-row="2" />
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const observer = () => FakeResizeObserver.instances[0];
const scroll = () => act(() => scroller.dispatchEvent(new Event('scroll', { bubbles: true })));

describe('useStickToBottom', () => {
  it('snaps the scroller itself to the bottom (never scrollIntoView)', () => {
    const g = geometry(scroller, { scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
    act(() => api.snapToBottom());
    expect(g.scrollTop).toBe(1500);
    expect(scrollIntoView).not.toHaveBeenCalled();
    // The jump never inherits the global smooth scroll-behavior.
    expect(scroller.style.scrollBehavior).toBe('');
  });

  it('observes the scroller and its rows', () => {
    const rows = Array.from(scroller.children);
    expect(observer().observed.has(scroller)).toBe(true);
    for (const row of rows) expect(observer().observed.has(row)).toBe(true);
  });

  it('re-pins to the bottom when a row grows while the reader is at the bottom', () => {
    const g = geometry(scroller, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 });
    const row = scroller.children[0];
    // First reports only record sizes.
    observer().fire([{ target: row, contentRect: { height: 40 } }]);
    expect(g.scrollTop).toBe(1500);

    // An image above decodes: content grows, scrollTop stays (no scroll anchoring).
    g.scrollHeight = 2300;
    observer().fire([{ target: row, contentRect: { height: 340 } }]);
    expect(g.scrollTop).toBe(1800);
  });

  it('re-pins when the scroller itself shrinks (tape, pinned band, keyboard)', () => {
    const g = geometry(scroller, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 });
    observer().fire([{ target: scroller, contentRect: { height: 500 } }]);
    g.clientHeight = 420;
    observer().fire([{ target: scroller, contentRect: { height: 420 } }]);
    expect(g.scrollTop).toBe(1580);
  });

  it('leaves a reader who scrolled up alone', () => {
    const g = geometry(scroller, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 });
    const row = scroller.children[0];
    observer().fire([{ target: row, contentRect: { height: 40 } }]);

    g.scrollTop = 1500 - STICK_THRESHOLD_PX - 40;
    scroll();
    g.scrollHeight = 2300;
    observer().fire([{ target: row, contentRect: { height: 340 } }]);
    expect(g.scrollTop).toBe(1500 - STICK_THRESHOLD_PX - 40);
    expect(api.stickRef.current).toBe(false);
  });

  it('keeps following through the intermediate positions of its own glide', () => {
    const g = geometry(scroller, { scrollHeight: 2000, clientHeight: 500, scrollTop: 600 });
    scroll();
    expect(api.stickRef.current).toBe(false);
    scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
    act(() => api.glideToBottom());
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });

    // Mid-glide scroll events are the animation, not the reader.
    g.scrollTop = 900;
    scroll();
    expect(api.stickRef.current).toBe(true);

    // A touch is the reader taking over: their position counts again.
    act(() => scroller.dispatchEvent(new Event('touchstart')));
    act(() => scroller.dispatchEvent(new Event('touchend')));
    scroll();
    expect(api.stickRef.current).toBe(false);
  });
});
