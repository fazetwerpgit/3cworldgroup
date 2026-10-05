// In-memory sliding-window limiter, per key (a uid, or a client IP on public
// routes). Per server instance only: a cold start or a second instance starts
// its own count, so it caps a burst from one caller rather than enforcing an
// exact quota. Enough to keep a stuck client or a tap-happy rep from running up
// a paid API, or a script from flooding a public form.

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

/** The caller's IP as Vercel forwards it, or '' when unknown (all unknowns share one bucket). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || '';
}
