// Chrome ("Failed to fetch") and WebKit/iPhone ("Load failed") report every
// network-level fetch failure as a plain TypeError: offline, DNS, CORS, and also
// fetches the browser tears down while the document unloads. The message alone
// cannot tell those apart, so it only counts as an abort while the page is
// actually going away.
const NETWORK_TYPE_ERROR_MESSAGES = new Set(['Failed to fetch', 'Load failed']);

let pageUnloading = false;

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { pageUnloading = true; });
  window.addEventListener('beforeunload', () => { pageUnloading = true; });
  // Back/forward cache restore: the page is live again.
  window.addEventListener('pageshow', () => { pageUnloading = false; });
}

export function isAbortError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;

  return pageUnloading &&
    error instanceof TypeError &&
    NETWORK_TYPE_ERROR_MESSAGES.has(error.message);
}
