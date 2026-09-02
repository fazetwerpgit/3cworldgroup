/**
 * Decides whether to show the "Add to Home Screen" nudge.
 *
 * Only iOS Safari can install a web app from the Share sheet, so the banner
 * is pointless (and confusing) anywhere else. Third-party iOS browsers
 * (Chrome = CriOS, Firefox = FxiOS, Edge = EdgiOS, Opera = OPT) wrap WebKit
 * but do not offer Add to Home Screen, so they are excluded too.
 */
export function isIosSafari(userAgent: string): boolean {
  const ua = userAgent;
  const isIosDevice = /iPhone|iPad|iPod/.test(ua);
  if (!isIosDevice) return false;
  const isThirdParty = /CriOS|FxiOS|EdgiOS|OPT\//.test(ua);
  if (isThirdParty) return false;
  return /Safari/.test(ua);
}

export interface AddToHomeScreenInput {
  userAgent: string;
  /** window.navigator.standalone — true when launched from the home screen icon. */
  standalone: boolean;
  /** true when localStorage['a2hs-dismissed'] is set. */
  dismissed: boolean;
}

export function shouldShowAddToHomeScreen(input: AddToHomeScreenInput): boolean {
  if (input.standalone) return false;
  if (input.dismissed) return false;
  return isIosSafari(input.userAgent);
}
