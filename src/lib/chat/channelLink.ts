// A ?channel= deep link (push tap, shared URL) is untrusted input that ends up as
// a Firestore path segment: collection(db, 'chatChannels', id, 'messages').
// Anything that isn't a single valid document id ('a/b', '..', '__x__') makes
// collection() throw synchronously and crashes Team Chat into the error page,
// so reject it here and let the page fall back to the first channel.
const MAX_DOC_ID_BYTES = 1500;

export function linkedChannelId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.includes('/')) return null;
  if (raw === '.' || raw === '..') return null;
  if (/^__.*__$/.test(raw)) return null;
  if (new TextEncoder().encode(raw).length > MAX_DOC_ID_BYTES) return null;
  return raw;
}
