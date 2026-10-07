/**
 * Running as the installed app (opened from the home-screen icon). Browser only.
 * iOS 26 can report display-mode: standalone as false in a home-screen app, so
 * navigator.standalone comes first.
 */
export function isStandaloneApp(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}
