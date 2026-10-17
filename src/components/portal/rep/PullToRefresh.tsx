'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { nativeHaptic } from '@/lib/app/bridge';
import { hasDataRevalidators, revalidateDataCache } from '@/lib/cache/dataCache';
import { PULL_HOLD, pullDistance, pullProgress, readPullIntent, shouldRefresh } from './pullToRefresh';
import s from './rep.module.css';

// Pull to refresh inside the rep shell's <main> scroller, in the iOS app only
// (the shell's native pull to refresh is off; RepChrome mounts this only when
// useIsNativeApp). A pull starts only from a touch that lands with the
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
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
}) {
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const arcRef = useRef<SVGSVGElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let armed = false;
    let distance = 0;
    let refreshing = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

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

    const refresh = async () => {
      refreshing = true;
      setPhase('refreshing');
      paint(PULL_HOLD, true);
      const started = Date.now();
      try {
        await revalidateDataCache();
      } finally {
        const left = MIN_SPIN_MS - (Date.now() - started);
        if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
        refreshing = false;
        if (!disposed) settle();
      }
    };

    const onStart = (event: TouchEvent) => {
      start = null;
      pulling = false;
      armed = false;
      if (refreshing || event.touches.length !== 1) return;
      // Only from rest at the top: never mid-scroll or mid-fling.
      if (scroller.scrollTop > 0) return;
      if (!window.matchMedia?.('(max-width: 1023px)').matches) return;
      if (!hasDataRevalidators()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && scrolledWithin(target, scroller)) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!pulling) {
        const intent = readPullIntent(dx, dy);
        if (intent === 'scroll' || scroller.scrollTop > 0) {
          start = null;
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
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onEnd);
    return () => {
      disposed = true;
      if (settleTimer) clearTimeout(settleTimer);
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
      const content = contentRef.current;
      if (content) {
        content.style.transition = '';
        content.style.transform = '';
      }
    };
  }, [scrollerRef, contentRef]);

  return (
    <>
      <div ref={indicatorRef} className={s.ptr} data-state={phase} aria-hidden="true">
        <svg ref={arcRef} className={s.ptrArc} viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <span className={s.srOnly} role="status" aria-live="polite">
        {phase === 'refreshing' ? 'Refreshing' : ''}
      </span>
    </>
  );
}
