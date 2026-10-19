// A notification link is opened with router.push in the bell. Only accept a
// same-origin portal path, so a stored link can never be a javascript: URL,
// a protocol-relative //host, or an external phishing page.
export function safeNotificationLink(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  if (link.length > 2048) return null;
  // Backslashes and control/whitespace chars are normalised by browsers into
  // other URLs (e.g. "/\evil.com" -> "//evil.com"), so reject them outright.
  if (/[\\\s\u0000-\u001f\u007f]/.test(link)) return null;
  if (!/^\/portal(?:[/?#]|$)/.test(link)) return null;
  return link;
}
