'use client';

import { useCallback, useState } from 'react';

/** The side a dual (fiber + solar) rep last picked on a Fiber | Solar switch. */
export type RememberedSide = 'fiber' | 'solar';

/** The Board's Fiber | Solar switch. */
export const BOARD_SIDE_KEY = '3c-board-side';
/** The Sales tab's Fiber | Solar switch. */
export const SALES_SIDE_KEY = '3c-sales-side';

/**
 * The side last stored under `key`, or 'fiber' when there is none, it is not a
 * side, or storage is unavailable (private mode, blocked site data, the server).
 */
export function readSide(key: string): RememberedSide {
  try {
    if (typeof window === 'undefined') return 'fiber';
    return window.localStorage.getItem(key) === 'solar' ? 'solar' : 'fiber';
  } catch {
    return 'fiber';
  }
}

/** Stores the side under `key`; a storage failure only means it is not remembered. */
export function writeSide(key: string, side: RememberedSide): void {
  try {
    window.localStorage.setItem(key, side);
  } catch {
    // Not remembered next time; the switch still works now.
  }
}

/**
 * A Fiber | Solar pick that survives a reload: read once on mount, written on
 * every change.
 */
export function useRememberedSide(key: string): [RememberedSide, (side: RememberedSide) => void] {
  const [side, setSide] = useState<RememberedSide>(() => readSide(key));
  const pick = useCallback(
    (next: RememberedSide) => {
      setSide(next);
      writeSide(key, next);
    },
    [key],
  );
  return [side, pick];
}
