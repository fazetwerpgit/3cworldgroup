'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { nativeHaptic } from '@/lib/app/bridge';
import { hasDataRevalidators, onRevalidatorDisposed, revalidateDataCache } from '@/lib/cache/dataCache';
import { PULL_HOLD, pullDistance, pullProgress, readPullIntent, shouldRefresh } from './pullToRefresh';
import s from './rep.module.css';

// Pull to refresh inside the rep shell's <main> scroller, in the iOS app only
// (the shell's native pull to refresh is off; RepChrome mounts this only when
// useIsNativeApp). Below 1024px <main> is the scroller; at 1024px and up (an
// iPad in landscape) the window scrolls instead, so "at the top" checks both.
// A pull starts only from a touch that lands with the
// scroller already at the top, so it never takes over a scroll or the tail of
// a momentum fling. Releasing past the threshold asks every mounted screen to
// refetch quietly (revalidateDataCache) and holds the spinner until they land.
// Screens with nothing to refetch (chat, forms) never start a pull.

type Phase = 'idle' | 'pulling' | 'armed' | 'refreshing';

/** The spinner stays at least this long, so a fast refetch still reads as a refresh. */
const MIN_SPIN_MS = 600;
const SETTLE_MS = 280;
const SETTLE_EASE = 'var(--ease-sheet, cubic-bezier(0.32, 0.72, 0, 1))';

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * How far the page is scrolled: <main> on the phone shell, the window on the
 * desktop layout (where <main> does not scroll). Whichever is not the scroller
 * reads 0, so the sum works at any width and across a resize.
 */
function pageScrollTop(scroller: HTMLElement): number {
  const doc = typeof document !== 'undefined' ? document.scrollingElement : null;
  return Math.max(0, scroller.scrollTop) + Math.max(0, window.scrollY || doc?.scrollTop || 0);
}

/** True when `target` sits in a scroller inside `root` that is not at its top. */
function scrolledWithin(target: Element | null, root: HTMLElement): boolean {
  for (let node = target; node && node !== root; node = node.parentElement) {
    if (node instanceof HTMLElement && node.scrollTop > 0) return true;
  }
  return false;
}

export function PullToRefresh({
  scrollerRef,
  contentRef,
  pathname,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  /** The route: a refresh still spinning when it changes is dropped at once. */
  pathname?: string | null;
}) {
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  // Ends a running refresh now (route change, or the screen that was
  // refetching unmounted): no minimum spin, no settle animation.
  const cancelRef = useRef<(() => void) | null>(null);
  const arcRef = useRef<SVGSVGElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // The node to reset on teardown, as it was when the effect ran (the ref may be gone by then).
    const contentAtStart = contentRef.current;
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let armed = false;
    let distance = 0;
    let refreshing = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    // The non-passive touchmove is attached only for a touch that can become
    // a pull (landed at the top), so every other scroll stays passive.
    let moving = false;
    const listenMoves = (on: boolean) => {
      if (on === moving) return;
      moving = on;
      if (on) scroller.addEventListener('touchmove', onMove, { passive: false });
      else scroller.removeEventListener('touchmove', onMove);
    };

    /** Places the content and the indicator for a pull of `d` px. */
    const paint = (d: number, transition: boolean) => {
      const content = contentRef.current;
      const indicator = indicatorRef.current;
      const timing = transition && !reducedMotion() ? `${SETTLE_MS}ms ${SETTLE_EASE}` : '';
      if (content) {
        content.style.transition = timing ? `transform ${timing}` : 'none';
        content.style.transform = d > 0 ? `translate3d(0, ${d}px, 0)` : '';
      }
      if (indicator) {
        const progress = pullProgress(d);
        indicator.style.transition = timing ? `transform ${timing}, opacity ${timing}` : 'none';
        // Centred in the gap the content leaves above it.
        indicator.style.transform = `translate3d(0, ${Math.round(d / 2 - 18)}px, 0) scale(${0.6 + 0.4 * progress})`;
        indicator.style.opacity = String(progress);
      }
      if (arcRef.current && !refreshing) arcRef.current.style.transform = `rotate(${Math.round(pullProgress(d) * 270)}deg)`;
    };

    const settle = () => {
      paint(0, true);
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const content = contentRef.current;
        // No transform left behind: a transformed ancestor would trap fixed children.
        if (content) {
          content.style.transition = '';
          content.style.transform = '';
        }
        if (!disposed) setPhase('idle');
      }, SETTLE_MS);
    };

    /** Puts everything back at once (no transition) and goes idle. */
    const reset = () => {
      if (settleTimer) clearTimeout(settleTimer);
      paint(0, false);
      const content = contentRef.current;
      if (content) {
        content.style.transition = '';
        content.style.transform = '';
      }
      if (!disposed) setPhase('idle');
    };

    const refresh = async () => {
      refreshing = true;
      setPhase('refreshing');
      paint(PULL_HOLD, true);
      const started = Date.now();
      let cancel: () => void = () => undefined;
      const cancelled = new Promise<'cancelled'>((resolve) => {
        cancel = () => resolve('cancelled');
      });
      cancelRef.current = cancel;
      const outcome = await Promise.race([revalidateDataCache().then(() => 'done' as const), cancelled]);
      if (outcome === 'done') {
        const left = MIN_SPIN_MS - (Date.now() - started);
        if (left > 0) await Promise.race([new Promise((resolve) => setTimeout(resolve, left)), cancelled]);
      }
      if (cancelRef.current === cancel) cancelRef.current = null;
      refreshing = false;
      if (disposed) return;
      if (outcome === 'cancelled') reset();
      else settle();
    };

    // The screen that was refreshing went away (its revalidator was disposed).
    const stopWatching = onRevalidatorDisposed(() => {
      if (refreshing && !hasDataRevalidators()) cancelRef.current?.();
    });

    const onStart = (event: TouchEvent) => {
      // A second finger landing mid-pull ends the pull: put the content back
      // (as touchcancel does), or it stays translated with nothing to settle it.
      if (pulling) {
        start = null;
        pulling = false;
        armed = false;
        distance = 0;
        listenMoves(false);
        settle();
        return;
      }
      start = null;
      pulling = false;
      armed = false;
      if (refreshing || event.touches.length !== 1) return;
      // Only from rest at the top: never mid-scroll or mid-fling.
      if (pageScrollTop(scroller) > 0) return;
      if (!hasDataRevalidators()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && scrolledWithin(target, scroller)) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      listenMoves(true);
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!pulling) {
        const intent = readPullIntent(dx, dy);
        if (intent === 'scroll' || pageScrollTop(scroller) > 0) {
          start = null;
          listenMoves(false);
          return;
        }
        // Mostly downward at the top: hold the native bounce off from the very
        // first move, or iOS commits to it and later moves cannot be stopped.
        if (dy > 0 && dy >= Math.abs(dx) && event.cancelable) event.preventDefault();
        if (intent !== 'pull') return;
        pulling = true;
        if (settleTimer) clearTimeout(settleTimer);
        setPhase('pulling');
      }
      if (event.cancelable) event.preventDefault();
      distance = pullDistance(dy);
      paint(distance, false);
      const nowArmed = shouldRefresh(distance);
      if (nowArmed !== armed) {
        armed = nowArmed;
        setPhase(nowArmed ? 'armed' : 'pulling');
        // The same tick iOS gives when a pull reaches the refresh point.
        if (nowArmed) nativeHaptic('light');
      }
    };

    const onEnd = (event: TouchEvent) => {
      listenMoves(false);
      const wasPulling = pulling;
      start = null;
      pulling = false;
      if (!wasPulling) return;
      if (event.type !== 'touchcancel' && shouldRefresh(distance)) void refresh();
      else settle();
      distance = 0;
      armed = false;
    };

    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onEnd);
    return () => {
      disposed = true;
      stopWatching();
      cancelRef.current?.();
      if (settleTimer) clearTimeout(settleTimer);
      listenMoves(false);
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
      if (contentAtStart) {
        contentAtStart.style.transition = '';
        contentAtStart.style.transform = '';
      }
    };
  }, [scrollerRef, contentRef]);

  // A new route: drop a refresh that is still spinning for the old one.
  useEffect(() => {
    cancelRef.current?.();
  }, [pathname]);

  return (
    <>
      <div className={s.ptrRail} aria-hidden="true" data-ptr-rail="">
        <div ref={indicatorRef} className={s.ptr} data-state={phase}>
          <svg ref={arcRef} className={s.ptrArc} viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
      </div>
      <span className={s.srOnly} role="status" aria-live="polite">
        {phase === 'refreshing' ? 'Refreshing' : ''}
      </span>
    </>
  );
}
