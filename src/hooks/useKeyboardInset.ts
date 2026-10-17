'use client';

import { useEffect, useSyncExternalStore, type RefObject } from 'react';

// The on-screen keyboard, read from the visual viewport. iOS Safari, the PWA
// and the app's WKWebView all leave the layout viewport alone when the
// keyboard opens and shrink (and sometimes pan) the visual viewport instead,
// so a field at the bottom of the page or in a bottom sheet ends up under the
// keyboard. The shell does not send a keyboard event (docs/ios-app/BRIDGE.md),
// so the visual viewport is the one source in every surface.

export interface KeyboardViewportSample {
  /** window.innerHeight: the layout viewport. */
  innerHeight: number;
  /** visualViewport.height / offsetTop / scale. */
  height: number;
  offsetTop: number;
  scale: number;
}

export interface KeyboardState {
  /** Pixels of the layout viewport the keyboard covers at the bottom (0 when it is down). */
  inset: number;
  /** Height of what is still visible (the visual viewport). */
  viewportHeight: number;
}

// Anything smaller is browser chrome settling (the URL bar), not a keyboard.
const KEYBOARD_MIN_PX = 80;

/**
 * Height the keyboard covers at the bottom of the layout viewport, or 0. A
 * pinch-zoomed page shrinks the visual viewport exactly like a keyboard does,
 * so it reads as 0 and nothing moves.
 */
export function keyboardInsetFrom(sample: KeyboardViewportSample): number {
  if (sample.scale > 1.01) return 0;
  const covered = sample.innerHeight - sample.height - sample.offsetTop;
  return covered > KEYBOARD_MIN_PX ? Math.round(covered) : 0;
}

/**
 * How far a box whose bottom edge is at `rectBottom` (layout-viewport px, from
 * getBoundingClientRect) must move up to clear the keyboard with `margin` to
 * spare. 0 when it is already visible.
 */
export function overlapBelowVisible(
  rectBottom: number,
  viewport: { offsetTop: number; height: number },
  margin = 12
): number {
  const visibleBottom = viewport.offsetTop + viewport.height;
  return Math.max(0, Math.ceil(rectBottom + margin - visibleBottom));
}

const CLOSED: KeyboardState = { inset: 0, viewportHeight: 0 };
let snapshot: KeyboardState = CLOSED;

function sample(): KeyboardState {
  const vv = window.visualViewport;
  if (!vv) return CLOSED;
  const inset = keyboardInsetFrom({
    innerHeight: window.innerHeight,
    height: vv.height,
    offsetTop: vv.offsetTop,
    scale: vv.scale,
  });
  if (inset === 0) return CLOSED;
  const viewportHeight = Math.round(vv.height);
  if (snapshot.inset === inset && snapshot.viewportHeight === viewportHeight) return snapshot;
  return { inset, viewportHeight };
}

function subscribe(onChange: () => void) {
  const vv = window.visualViewport;
  const update = () => {
    const next = sample();
    if (next === snapshot) return;
    snapshot = next;
    onChange();
  };
  update();
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  return () => {
    vv?.removeEventListener('resize', update);
    vv?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
}

/** The keyboard's cover right now. Server render and hydration read it as down. */
export function useKeyboardInset(): KeyboardState {
  return useSyncExternalStore(subscribe, () => snapshot, () => CLOSED);
}

/** The nearest ancestor that scrolls vertically (the rep shell's <main> on phones), or null. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Keeps `targetRef` (a composer) above the keyboard while a field inside it
 * has focus: when the keyboard opens or changes height, its scroller moves it
 * up just enough. Returns the keyboard state so the caller can leave room to
 * scroll into (a spacer of `inset` px after the composer).
 */
export function useKeepAboveKeyboard(targetRef: RefObject<HTMLElement | null>, enabled = true): KeyboardState {
  const keyboard = useKeyboardInset();
  const { inset } = keyboard;

  useEffect(() => {
    if (!enabled || inset <= 0) return;
    const el = targetRef.current;
    if (!el || !el.contains(document.activeElement)) return;
    // After the spacer has rendered, so there is room to scroll into.
    const frame = window.requestAnimationFrame(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      const overlap = overlapBelowVisible(el.getBoundingClientRect().bottom, vv);
      if (overlap <= 0) return;
      const scroller = scrollParent(el);
      if (scroller) scroller.scrollBy({ top: overlap });
      else window.scrollBy({ top: overlap });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, inset, targetRef]);

  return keyboard;
}

/** Test-only: forget the cached keyboard state. */
export function __resetKeyboardForTests(): void {
  snapshot = CLOSED;
}
