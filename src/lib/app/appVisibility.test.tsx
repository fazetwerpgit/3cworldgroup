// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetBridgeForTests, receiveNativeMessage } from './bridge';
import { clearSessionMotionKeys, installResumeMotionReset, isAppVisible, useAppVisible } from './appVisibility';
import { useFirstReveal } from '@/hooks/useFirstReveal';
import { useCountUp } from '@/hooks/useCountUp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** What the shell's injection does: update the flag, then deliver. */
function shellSends(visible: boolean) {
  act(() => {
    window.__3C_VISIBLE__ = visible;
    receiveNativeMessage({ source: '3c-shell', type: 'visible', visible });
  });
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  __resetBridgeForTests();
  window.sessionStorage.clear();
  window.matchMedia = ((query: string) => ({ matches: false, media: query }) as MediaQueryList);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  delete window.__3C_APP__;
  delete window.__3C_VISIBLE__;
  __resetBridgeForTests();
});

describe('isAppVisible', () => {
  it('is always true on the web', () => {
    window.__3C_VISIBLE__ = false;
    expect(isAppVisible()).toBe(true);
  });

  it('in the app follows window.__3C_VISIBLE__, and an older shell without it counts as visible', () => {
    window.__3C_APP__ = true;
    expect(isAppVisible()).toBe(true);
    window.__3C_VISIBLE__ = false;
    expect(isAppVisible()).toBe(false);
    window.__3C_VISIBLE__ = true;
    expect(isAppVisible()).toBe(true);
  });
});

describe('useAppVisible', () => {
  it('re-renders on visible events', () => {
    window.__3C_APP__ = true;
    window.__3C_VISIBLE__ = false;
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useAppVisible());
      return null;
    }
    act(() => root.render(<Probe />));
    expect(seen.at(-1)).toBe(false);
    shellSends(true);
    expect(seen.at(-1)).toBe(true);
    shellSends(false);
    expect(seen.at(-1)).toBe(false);
  });
});

describe('reveals wait for the portal to be on screen in the app', () => {
  it('useFirstReveal decides and marks its key only after visible:true', () => {
    window.__3C_APP__ = true;
    window.__3C_VISIBLE__ = false;
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useFirstReveal('3c:reveal:test', true));
      return null;
    }
    act(() => root.render(<Probe />));
    expect(seen.at(-1)).toBe(false);
    expect(window.sessionStorage.getItem('3c:reveal:test')).toBeNull();
    shellSends(true);
    expect(seen.at(-1)).toBe(true);
    expect(window.sessionStorage.getItem('3c:reveal:test')).toBe('1');
  });

  it('useCountUp shows the value while hidden and starts counting (and marks) only once visible', () => {
    window.__3C_APP__ = true;
    window.__3C_VISIBLE__ = false;
    const frames: Array<(t: number) => void> = [];
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: (t: number) => void) => frames.push(cb)) as typeof window.requestAnimationFrame;
    function Num() {
      return <>{useCountUp(500, { sessionKey: '3c:countup:test' })}</>;
    }
    try {
      act(() => root.render(<Num />));
      expect(container.textContent).toBe('500');
      expect(window.sessionStorage.getItem('3c:countup:test')).toBeNull();
      expect(frames).toHaveLength(0);
      shellSends(true);
      expect(container.textContent).toBe('0');
      expect(window.sessionStorage.getItem('3c:countup:test')).toBe('1');
      expect(frames.length).toBeGreaterThan(0);
    } finally {
      window.requestAnimationFrame = raf;
    }
  });
});

describe('resume after a long time away', () => {
  it('clears only the reveal and count-up keys', () => {
    const s = window.sessionStorage;
    s.setItem('3c:reveal:a', '1');
    s.setItem('3c:countup:b', '1');
    s.setItem('3c:other', 'keep');
    clearSessionMotionKeys();
    expect(s.getItem('3c:reveal:a')).toBeNull();
    expect(s.getItem('3c:countup:b')).toBeNull();
    expect(s.getItem('3c:other')).toBe('keep');
  });

  it('in the app, a resumed event replays reveals; on the web nothing is installed', () => {
    window.sessionStorage.setItem('3c:reveal:a', '1');
    const webUninstall = installResumeMotionReset();
    receiveNativeMessage({ source: '3c-shell', type: 'resumed', awayMs: 31 * 60_000 });
    expect(window.sessionStorage.getItem('3c:reveal:a')).toBe('1');
    webUninstall();

    window.__3C_APP__ = true;
    const uninstall = installResumeMotionReset();
    receiveNativeMessage({ source: '3c-shell', type: 'resumed', awayMs: 31 * 60_000 });
    expect(window.sessionStorage.getItem('3c:reveal:a')).toBeNull();
    uninstall();
  });

  it('drops malformed visible / resumed messages', () => {
    window.__3C_APP__ = true;
    window.sessionStorage.setItem('3c:reveal:a', '1');
    const uninstall = installResumeMotionReset();
    receiveNativeMessage({ source: '3c-shell', type: 'resumed', awayMs: 'long' });
    receiveNativeMessage({ type: 'resumed', awayMs: 5 });
    expect(window.sessionStorage.getItem('3c:reveal:a')).toBe('1');
    uninstall();
  });
});
