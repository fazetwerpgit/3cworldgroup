// Signed storage links (onboarding files, chat-report evidence) work for a
// short time only. Management screens can stay open far longer, so a link is
// re-signed when it is used after (or close to) its expiry, instead of
// opening GCS's AccessDenied / "Request has expired" page.

/** Treat a link as expired this long before it really is (slow phone clocks, the tap itself). */
export const SIGNED_LINK_MARGIN_MS = 60_000;

/** Onboarding file links are signed for 15 minutes (lib/onboarding/signFiles.ts). */
export const ONBOARDING_FILE_LINK_TTL_MS = 15 * 60 * 1000;

/** True when links fetched at `fetchedAt` and valid for `ttlMs` should be re-signed before use. */
export function signedLinksStale(fetchedAt: number, ttlMs: number, now = Date.now()): boolean {
  return now >= fetchedAt + ttlMs - SIGNED_LINK_MARGIN_MS;
}

/**
 * Opens a freshly signed link in a new tab after an async re-sign (no longer
 * inside the tap). Returns false when the browser blocked it, so the caller
 * can ask for another tap on the now-fresh link.
 */
export function openSignedLink(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const opened = window.open(url, '_blank');
  if (!opened) return false;
  try {
    opened.opener = null;
  } catch {
    // Cross-origin window: nothing to clear.
  }
  return true;
}
