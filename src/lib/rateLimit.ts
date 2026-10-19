// In-memory sliding-window limiter, per key (a uid, or a client IP on public
// routes). Per server instance only: a cold start or a second instance starts
// its own count, so it caps a burst from one caller rather than enforcing an
// exact quota. Enough to keep a stuck client or a tap-happy rep from running up
// a paid API, or a script from flooding a public form.

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  let lastSweep = -Infinity;

  // Drops every key whose newest hit has left the window, at most once per
  // window, so keys from one-off callers (each public-form IP) do not pile up
  // for the life of the instance.
  function sweep(now: number) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1] >= windowMs) hits.delete(key);
    }
  }

  return {
    /** Records a hit for `key` and returns true, or returns false when over the limit. */
    take(key: string, now = Date.now()): boolean {
      sweep(now);
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    /** Number of keys currently tracked (for tests). */
    size(): number {
      return hits.size;
    },
    reset() {
      hits.clear();
      lastSweep = -Infinity;
    },
  };
}

/** The caller's IP as Vercel forwards it, or '' when unknown (all unknowns share one bucket). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || '';
}
