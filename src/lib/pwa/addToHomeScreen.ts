/**
 * Only iOS Safari can install a web app from the Share sheet. Third-party iOS
 * browsers (Chrome = CriOS, Firefox = FxiOS, Edge = EdgiOS, Opera = OPT) wrap
 * WebKit but are excluded: the add-to-home-screen steps are Safari's.
 */
export function isIosSafari(userAgent: string): boolean {
  const ua = userAgent;
  const isIosDevice = /iPhone|iPad|iPod/.test(ua);
  if (!isIosDevice) return false;
  const isThirdParty = /CriOS|FxiOS|EdgiOS|OPT\//.test(ua);
  if (isThirdParty) return false;
  return /Safari/.test(ua);
}
