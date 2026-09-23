// Phone thread layout while the on-screen keyboard is up (see MobileThread).

export interface ViewportSample {
  innerHeight: number;
  // visualViewport height / offsetTop / scale.
  height: number;
  offsetTop: number;
  scale: number;
}

// Anything smaller than this is browser chrome settling, not a keyboard.
const KEYBOARD_MIN_PX = 80;

/**
 * Height the keyboard covers at the bottom of the layout viewport (0 when it's
 * down), or null when it can't be told: a pinch-zoomed page shrinks the visual
 * viewport exactly like a keyboard does, so the layout is left alone.
 */
export function keyboardInset(sample: ViewportSample): number | null {
  if (sample.scale > 1.01) return null;
  const covered = Math.max(0, sample.innerHeight - sample.height - sample.offsetTop);
  return covered > KEYBOARD_MIN_PX ? Math.round(covered) : 0;
}

// The GIF picker opens 8px above its button; keep 8px clear of the top too.
const GIF_GAP_PX = 16;
const GIF_MIN_PX = 160;
const GIF_MAX_PX = 392;

/**
 * Tallest the GIF picker can be when it opens upward from `anchorTop` without
 * crossing `topBound` (the top of the thread): shrinks while the keyboard is up
 * so the search box stays on screen.
 */
export function gifPickerMaxHeight(anchorTop: number, topBound: number): number {
  const space = Math.floor(anchorTop - Math.max(0, topBound) - GIF_GAP_PX);
  return Math.min(GIF_MAX_PX, Math.max(GIF_MIN_PX, space));
}
