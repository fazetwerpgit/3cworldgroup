'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// How close to the bottom (px) a reader's own scroll must end for the thread to
// keep following new layout. Tighter than the 150px "pinned" margin: someone
// who nudged up a little to re-read a line is left alone when an image loads.
export const STICK_THRESHOLD_PX = 24;

export function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

/**
 * Sets scrollTop as a jump. The thread scroller inherits scroll-behavior:
 * smooth from the global html rule, which would otherwise animate a plain
 * assignment (and re-fire scroll handlers mid-glide).
 */
export function setScrollTopInstant(el: HTMLElement, value: number): void {
  const previous = el.style.scrollBehavior;
  el.style.scrollBehavior = 'auto';
  el.scrollTop = value;
  el.style.scrollBehavior = previous;
}

/**
 * Bottom positioning for a chat scroller, scoped to the scroller itself — never
 * scrollIntoView, which also scrolls every scrollable ancestor (in the installed
 * iOS app the shell is taller than the screen, so that shifted the whole app up).
 *
 * Stick-to-bottom: while the reader is at the bottom, any later layout change —
 * the scroller resizing (keyboard, company tape, pinned band) or a message
 * changing height (an image without stored dimensions decoding) — re-pins it to
 * the bottom. Once the reader scrolls up themselves it stops; it never fights them.
 */
export function useStickToBottom(scrollRef: RefObject<HTMLElement | null>) {
  // Whether the thread should follow the bottom. Starts true: a thread opens
  // at the bottom.
  const stickRef = useRef(true);
  // A smooth glide we started is in flight: its intermediate scroll positions
  // are ours, not the reader's, so they don't clear stickRef.
  const glidingRef = useRef(false);
  const touchingRef = useRef(false);

  const snapToBottom = useCallback(() => {
    stickRef.current = true;
    glidingRef.current = false;
    const el = scrollRef.current;
    if (el) setScrollTopInstant(el, el.scrollHeight);
  }, [scrollRef]);

  const glideToBottom = useCallback(() => {
    stickRef.current = true;
    const el = scrollRef.current;
    if (!el) return;
    if (distanceFromBottom(el) <= 1) {
      glidingRef.current = false;
      return;
    }
    glidingRef.current = true;
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else setScrollTopInstant(el, el.scrollHeight);
  }, [scrollRef]);

  // Call from the scroller's scroll handler.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = distanceFromBottom(el) <= STICK_THRESHOLD_PX;
    if (glidingRef.current) {
      if (atBottom) glidingRef.current = false;
      return;
    }
    stickRef.current = atBottom;
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A touch or wheel is the reader taking over: their scrolls count again.
    const onTouchStart = () => {
      touchingRef.current = true;
      glidingRef.current = false;
    };
    const onTouchEnd = () => {
      touchingRef.current = false;
    };
    const onWheel = () => {
      glidingRef.current = false;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    const removeListeners = () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
    if (typeof ResizeObserver === 'undefined') return removeListeners;

    // Last seen height per observed element. The first report for an element
    // only records it: an append is the auto-scroll effect's job (it glides),
    // so only a CHANGE in an existing box re-pins here.
    const heights = new WeakMap<Element, number>();
    const resizeObserver = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const height = entry.contentRect.height;
        const previous = heights.get(entry.target);
        heights.set(entry.target, height);
        if (previous !== undefined && previous !== height) changed = true;
      }
      if (!changed || !stickRef.current || touchingRef.current) return;
      if (distanceFromBottom(el) <= 1) return;
      glidingRef.current = false;
      setScrollTopInstant(el, el.scrollHeight);
    });
    resizeObserver.observe(el);
    const observeChild = (node: Node) => {
      if (node instanceof Element) resizeObserver.observe(node);
    };
    el.childNodes.forEach(observeChild);
    // Messages mount and unmount as the window moves: keep the observed set to
    // the scroller's current children.
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach(observeChild);
        record.removedNodes.forEach((node) => {
          if (node instanceof Element) resizeObserver.unobserve(node);
        });
      }
    });
    mutationObserver.observe(el, { childList: true });
    return () => {
      removeListeners();
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [scrollRef]);

  return { stickRef, snapToBottom, glideToBottom, onScroll };
}
