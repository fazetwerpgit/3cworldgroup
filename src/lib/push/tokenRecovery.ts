// When getToken fails, iOS may be holding a dead push subscription (permission
// still 'granted', every getToken rejects) and the fix is to unsubscribe and
// mint a fresh one. But a flaky connection fails getToken too — and throwing
// the subscription away then, with the retry failing for the same reason,
// leaves the device with no subscription at all. So only reset it when the
// device is online and the failure isn't a network one.

// Browser wordings for a request that never completed (Chrome, Safari, Firefox),
// also as they appear inside Firebase's "token-subscribe-failed" wrapper.
const NETWORK_MESSAGE =
  /failed to fetch|load failed|networkerror|network ?error|network request failed|network connection was lost|internet connection appears to be offline|err_internet_disconnected|err_network|timed? ?out/i;

export function isNetworkPushError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const e = error as { name?: unknown; code?: unknown; message?: unknown; customData?: { errorInfo?: unknown } } | null;
  if (!e || typeof e !== 'object') return false;
  // Not AbortError: pushManager.subscribe rejects with "AbortError: Registration
  // failed - push service error" for a broken subscription, which is the case
  // the reset exists for.
  if (e.name === 'NetworkError' || e.name === 'TimeoutError') return true;
  if (e.code === 'auth/network-request-failed') return true;
  const text = [e.message, e.customData?.errorInfo].filter((part) => typeof part === 'string').join(' ');
  return NETWORK_MESSAGE.test(text);
}

export function shouldResetPushSubscription(input: { online: boolean; error: unknown }): boolean {
  return input.online && !isNetworkPushError(input.error);
}
