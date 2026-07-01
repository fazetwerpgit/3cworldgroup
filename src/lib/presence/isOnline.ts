// A user is "online" if they pinged presence within this window. The presence
// heartbeat fires ~every 60s while a tab is visible, so a 3-minute window tolerates
// a missed beat or two without flickering to offline.
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

// Returns true if lastActiveAt is within the online window of `now`.
// Accepts a Date, an ISO string, a millis number, or null/undefined (→ offline).
export function isOnline(
  lastActiveAt: Date | string | number | null | undefined,
  now: number = Date.now()
): boolean {
  if (lastActiveAt == null) return false;
  const ts =
    lastActiveAt instanceof Date
      ? lastActiveAt.getTime()
      : typeof lastActiveAt === 'number'
        ? lastActiveAt
        : new Date(lastActiveAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts <= ONLINE_WINDOW_MS && ts <= now + ONLINE_WINDOW_MS;
}
