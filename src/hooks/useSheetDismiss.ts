'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Closing for the rep shell's bottom sheets (rep.module.css .backdrop/.sheet):
// - close() plays the exit (data-closing: the sheet slides down, the backdrop
//   fades) and calls onClose once it has finished, so the parent unmounts a
//   sheet that is already off screen instead of cutting it mid-frame.
// - On phones the sheet follows a downward drag from its handle, its header,
//   or a body already scrolled to the top; let go past a third of its height,
//   or flick it, and it closes from where the finger left it. Otherwise it
//   springs back. The backdrop's dim follows the drag.
// Reduced motion closes at once. Desktop (a centred dialog) never drags.

export interface DragSample {
  /** clientY in px. */
  y: number;
  /** Event timeStamp in ms. */
  t: number;
}

/** Last-moment speed of a drag in px/ms (downward positive), over the final `windowMs`. */
export function releaseVelocity(samples: DragSample[], windowMs = 100): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/** Faster than this (px/ms) downward is a flick: it closes even from a short drag. */
export const SHEET_FLICK_VELOCITY = 0.5;
/** A flick still has to travel this far, so a tap's jitter never closes. */
const SHEET_FLICK_MIN_PX = 16;
/** Dragged this share of the sheet's height (capped) and let go: it closes. */
const SHEET_DISMISS_SHARE = 0.33;
const SHEET_DISMISS_MAX_PX = 200;

/** Whether a drag that let go `distance` px down at `velocity` px/ms closes a sheet `height` px tall. */
export function shouldDismissSheet({
  distance,
  velocity,
  height,
}: {
  distance: number;
  velocity: number;
  height: number;
}): boolean {
  if (distance <= 0) return false;
  if (velocity >= SHEET_FLICK_VELOCITY && distance >= SHEET_FLICK_MIN_PX) return true;
  // Pulled back up at the end: the person changed their mind.
  if (velocity < -0.2) return false;
  return distance >= Math.min(height * SHEET_DISMISS_SHARE, SHEET_DISMISS_MAX_PX);
}

/** The backdrop's dim (0..1) with the sheet dragged `distance` px down. */
export function sheetDimFor(distance: number, height: number): number {
  if (height <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - distance / height));
}

function canAnimate(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** True when `target` sits in a scroller inside `sheet` that is not at its top. */
function scrolledWithin(target: Element | null, sheet: HTMLElement): boolean {
  for (let node = target; node && node !== sheet; node = node.parentElement) {
    if (node instanceof HTMLElement && node.scrollTop > 0) return true;
  }
  return false;
}

const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';

/** Width a both-ways scroller must overflow by to count as scrolling sideways. */
const REAL_SIDEWAYS_PX = 8;

/** True when `target` sits in a horizontal scroller inside `sheet` (a chip row, a wide table).
 *  A touch there belongs to that scroller: the sheet never takes it for a drag.
 *  A node counts only when it overflows by more than 1px and either scrolls
 *  sideways only (overflow-x auto/scroll, overflow-y not), or genuinely scrolls
 *  sideways (already scrolled, or wider by more than a rounding error). A
 *  vertical body scroller (overflow: auto) a sub-pixel too wide never blocks
 *  drag-to-dismiss. */
function inHorizontalScroller(target: Element | null, sheet: HTMLElement): boolean {
  for (let node = target; node && node !== sheet; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    const extra = node.scrollWidth - node.clientWidth;
    if (extra <= 1) continue;
    const style = window.getComputedStyle(node);
    if (!scrolls(style.overflowX)) continue;
    if (!scrolls(style.overflowY)) return true;
    if (node.scrollLeft > 0 || extra > REAL_SIDEWAYS_PX) return true;
  }
  return false;
}

/** Clearly a downward drag: far enough to mean it, and well over twice as vertical as sideways. */
function clearlyDown(dx: number, dy: number): boolean {
  return dy >= 3 && dy > 2 * Math.abs(dx);
}

const SNAP_MS = 240;
const DECIDE_PX = 6;

export interface SheetDismiss<S extends HTMLElement, B extends HTMLElement> {
  /** Play the exit, then call onClose. Safe to call more than once. */
  close: () => void;
  /** The exit is playing: put data-closing on the backdrop and the sheet. */
  closing: boolean;
  /** Callback refs for the sheet (the dragged element) and its backdrop. */
  sheetRef: (el: S | null) => void;
  backdropRef: (el: B | null) => void;
}

export function useSheetDismiss<S extends HTMLElement = HTMLElement, B extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  { exitMs = 180, drag = true }: { exitMs?: number; drag?: boolean } = {}
): SheetDismiss<S, B> {
  const sheetRef = useRef<S | null>(null);
  const backdropRef = useRef<B | null>(null);
  // The sheet as state too, so the drag listeners attach whenever it mounts
  // (a portal can render it a frame after this hook first runs).
  const [sheetEl, setSheetEl] = useState<S | null>(null);
  const setSheet = useCallback((el: S | null) => {
    sheetRef.current = el;
    setSheetEl(el);
  }, []);
  const setBackdrop = useCallback((el: B | null) => {
    backdropRef.current = el;
  }, []);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!canAnimate()) {
      closingRef.current = false;
      onCloseRef.current();
      return;
    }
    // Set now as well as on the next render, so a sheet let go mid-drag picks
    // up its exit in the same frame its inline animation is cleared.
    sheetRef.current?.setAttribute('data-closing', '');
    backdropRef.current?.setAttribute('data-closing', '');
    if (sheetRef.current) sheetRef.current.style.animation = '';
    setClosing(true);
    timerRef.current = setTimeout(() => {
      onCloseRef.current();
      // A parent that keeps the sheet (busy, say no) gets it back on screen;
      // one that unmounted it cleared this timer.
      timerRef.current = setTimeout(() => {
        closingRef.current = false;
        sheetRef.current?.removeAttribute('data-closing');
        backdropRef.current?.removeAttribute('data-closing');
        if (sheetRef.current) sheetRef.current.style.transform = '';
        backdropRef.current?.style.removeProperty('--sheet-dim');
        setClosing(false);
      }, 0);
    }, exitMs);
  }, [exitMs]);

  useEffect(() => {
    const sheet = sheetEl;
    if (!drag || !sheet) return;
    let start: { x: number; y: number } | null = null;
    let decided = false;
    let claimed = false;
    let atTop = true;
    let height = 0;
    let samples: DragSample[] = [];
    let snapTimer: ReturnType<typeof setTimeout> | null = null;

    const backdrop = () => backdropRef.current;
    // The non-passive touchmove is attached only while a drag can begin (a
    // touch that landed with the body at its top), so ordinary scrolling in
    // the sheet never waits on script.
    let moving = false;
    const listenMoves = (on: boolean) => {
      if (on === moving) return;
      moving = on;
      if (on) sheet.addEventListener('touchmove', onMove, { passive: false });
      else sheet.removeEventListener('touchmove', onMove);
    };
    const reset = () => {
      start = null;
      decided = false;
      claimed = false;
      samples = [];
    };
    const snapBack = () => {
      backdrop()?.removeAttribute('data-dragging');
      backdrop()?.style.removeProperty('--sheet-dim');
      sheet.style.transition = canAnimate() ? `transform ${SNAP_MS}ms var(--ease-sheet, cubic-bezier(0.32, 0.72, 0, 1))` : 'none';
      sheet.style.transform = '';
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        sheet.style.transition = '';
      }, SNAP_MS + 20);
    };

    const onStart = (event: TouchEvent) => {
      reset();
      if (closingRef.current || event.touches.length !== 1) return;
      if (window.matchMedia?.('(min-width: 1024px)').matches) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input[type="range"], [data-sheet-nodrag]')) return;
      // A sideways scroller keeps its touches: no drag, and never a preventDefault
      // (it would stop the row from scrolling).
      if (inHorizontalScroller(target, sheet)) return;
      const touch = event.touches[0];
      atTop = !scrolledWithin(target, sheet);
      // A body mid-scroll can only scroll: leave the touch to the browser, and
      // keep scrolling passive (no non-passive touchmove listener at all).
      if (!atTop) return;
      start = { x: touch.clientX, y: touch.clientY };
      samples = [{ y: touch.clientY, t: event.timeStamp }];
      listenMoves(true);
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!decided) {
        // Clearly downward from the top: hold the body's bounce off from the
        // first such move, or iOS commits to it before the drag is decided. A
        // diagonal or sideways start is left alone so it can still scroll.
        if (atTop && clearlyDown(dx, dy) && event.cancelable) event.preventDefault();
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        decided = true;
        claimed = atTop && clearlyDown(dx, dy);
        if (!claimed) {
          // An upward or sideways move: the browser scrolls it.
          start = null;
          listenMoves(false);
          return;
        }
        height = sheet.getBoundingClientRect().height;
        if (snapTimer) clearTimeout(snapTimer);
        // Inline wins over the open animation's fill, so the transform follows the finger.
        sheet.style.animation = 'none';
        sheet.style.transition = 'none';
        backdrop()?.setAttribute('data-dragging', '');
      }
      // Ours now: no page or body scroll under the drag.
      if (event.cancelable) event.preventDefault();
      const offset = Math.max(0, dy);
      sheet.style.transform = `translate3d(0, ${offset}px, 0)`;
      backdrop()?.style.setProperty('--sheet-dim', String(sheetDimFor(offset, height)));
      samples.push({ y: touch.clientY, t: event.timeStamp });
      if (samples.length > 12) samples.shift();
    };

    const onEnd = (event: TouchEvent) => {
      listenMoves(false);
      if (!start || !claimed) {
        reset();
        return;
      }
      const touch = event.changedTouches[0];
      const endY = touch ? touch.clientY : samples[samples.length - 1].y;
      const distance = endY - start.y;
      const velocity = releaseVelocity([...samples, { y: endY, t: event.timeStamp }]);
      reset();
      if (event.type !== 'touchcancel' && shouldDismissSheet({ distance, velocity, height })) {
        backdrop()?.removeAttribute('data-dragging');
        close();
      } else {
        snapBack();
      }
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      if (snapTimer) clearTimeout(snapTimer);
      listenMoves(false);
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [drag, close, sheetEl]);

  return { close, closing, sheetRef: setSheet, backdropRef: setBackdrop };
}
