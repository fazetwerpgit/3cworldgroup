// Turns a failed request's raw error text into words a rep can act on. Reps
// work doors on weak signal, so Safari's "Load failed", Firebase's
// auth/network-request-failed and a JSON parse error from an HTML 5xx page
// (res.json() throwing) must never reach the screen as-is.

const OFFLINE =
  /failed to fetch|load failed|networkerror|network request failed|network-request-failed|network connection was lost|internet connection appears to be offline|request timed out|offline/i;

// What each engine says when res.json() meets an HTML error page or an empty body.
const NOT_JSON =
  /unexpected token|not valid json|json\.parse|unexpected end of json|string did not match the expected pattern|unexpected character|unexpected eof/i;

// uploadFormAttachment gives up on a stalled upload with this message.
const UPLOAD_TIMEOUT = /^upload timed out/i;

export interface FriendlyError {
  offline: boolean;
  message: string;
}

/** `action` is the verb the retry needs: "send", "sign", "upload". */
export function friendlyError(raw: string, action = 'send'): FriendlyError {
  if (UPLOAD_TIMEOUT.test(raw)) return { offline: true, message: 'Upload timed out' };
  if (OFFLINE.test(raw)) return { offline: true, message: `No signal. Check your connection and ${action} again.` };
  if (NOT_JSON.test(raw)) return { offline: false, message: 'Server hiccup, try again.' };
  return { offline: false, message: raw };
}
