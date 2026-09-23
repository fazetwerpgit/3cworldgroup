/**
 * The strip an installed iOS 26 app leaves under its fixed bottom bars.
 *
 * WebKit bug 301108: in a home-screen app whose content runs under the status
 * bar (black-translucent + viewport-fit=cover), iOS 26 reports the layout
 * viewport (innerHeight, 100dvh) short by the top safe-area inset. Fixed
 * elements still anchor at the true screen top, so `bottom: 0` lands that many
 * points above the physical bottom. 100lvh keeps the true height. Installs made
 * before the status-bar meta changed keep the old style, so this is measured at
 * runtime rather than assumed from the meta.
 */

/** A status bar is at most ~62pt; anything taller is the keyboard or browser chrome. */
export const MAX_BOTTOM_GAP = 80;

/** At and above this width the portal shows desktop chrome with no bottom bars. */
const DESKTOP_MIN_WIDTH = 1024;

export interface BottomGapInput {
  /** Launched from the home screen (navigator.standalone or display-mode). */
  standalone: boolean;
  /** Height of a fixed probe sized 100lvh. */
  largeViewportHeight: number;
  /** env(safe-area-inset-top) in px: 0 when the page sits below an opaque status bar. */
  safeAreaTop: number;
  innerHeight: number;
  innerWidth: number;
  /** screen.width / screen.height: iOS reports them in portrait whatever the orientation. */
  screenWidth: number;
  screenHeight: number;
}

/**
 * How far (px) fixed bottom bars must drop to sit on the physical screen bottom.
 * 0 everywhere the viewport is sized correctly: Safari tabs, desktop, Android,
 * an opaque status bar, and a keyboard-shrunk viewport.
 */
export function bottomGap(input: BottomGapInput): number {
  if (!input.standalone || input.innerWidth >= DESKTOP_MIN_WIDTH) return 0;
  // The bug only strikes when the page runs under the status bar.
  if (!(input.safeAreaTop > 0)) return 0;

  const gap = Math.round(input.largeViewportHeight - input.innerHeight);
  // Under 2px is rounding. Over the top inset (plus rounding) is not this bug.
  if (!(gap >= 2) || gap > MAX_BOTTOM_GAP || gap > Math.round(input.safeAreaTop) + 2) return 0;

  // Never push a bar below the glass: viewport + gap must fit on the screen.
  const long = Math.max(input.screenWidth, input.screenHeight);
  const short = Math.min(input.screenWidth, input.screenHeight);
  const physical = input.innerHeight >= input.innerWidth ? long : short;
  if (physical > 0 && input.innerHeight + gap > physical + 1) return 0;

  return gap;
}
