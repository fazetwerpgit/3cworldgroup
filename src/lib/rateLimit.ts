// In-memory sliding-window limiter, per key (a uid). Per server instance only:
// a cold start or a second instance starts its own count, so it caps a burst
// from one rep rather than enforcing an exact quota. Enough to keep a stuck
// client or a tap-happy rep from running up a paid API.

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return {
    /** Records a hit for `key` and returns true, or returns false when over the limit. */
    take(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}
