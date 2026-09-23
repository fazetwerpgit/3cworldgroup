// Random lowercase hex, `bytes` bytes long: 32 characters by default, the same
// shape as crypto.randomUUID() with the dashes stripped. Use this in client
// code instead of randomUUID, which only exists in a secure context: a phone on
// the plain-http LAN dev server has none, and calling it crashes the page.
// getRandomValues works on any origin.
export function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
