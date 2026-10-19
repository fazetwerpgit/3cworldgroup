import { NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/rateLimit';

// Per-user caps on the routes a script could loop to spam people: every chat
// message pushes to each member's phone, and every form submission emails the
// managers. In memory, per server instance (lib/rateLimit), so they stop a
// burst from one account rather than set an exact quota. Generous on purpose:
// no person typing or tapping gets near them.

const MINUTE_MS = 60_000;

export const USER_RATE_LIMITS = {
  /** Chat sends (and edits). */
  chatMessage: createRateLimiter({ limit: 30, windowMs: MINUTE_MS }),
  /** Chat attachment uploads (up to 10 MB each). */
  chatUpload: createRateLimiter({ limit: 20, windowMs: MINUTE_MS }),
  /** Form submissions (payroll dispute, leads, expedite, fiber, interview, bug report). */
  formSubmit: createRateLimiter({ limit: 10, windowMs: MINUTE_MS }),
  /** Form attachment uploads (sale proof, dispute and leads screenshots). */
  formUpload: createRateLimiter({ limit: 30, windowMs: MINUTE_MS }),
} as const;

export type UserRateLimit = keyof typeof USER_RATE_LIMITS;

/**
 * Takes one hit for `uid` on `kind`. Returns a 429 response when the caller is
 * over the limit, or null to carry on.
 */
export function userRateLimited(kind: UserRateLimit, uid: string): NextResponse | null {
  if (USER_RATE_LIMITS[kind].take(uid)) return null;
  return NextResponse.json(
    { error: 'Too many requests. Wait a minute and try again.', code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': '60' } }
  );
}

/** Tests: clear every per-user count. */
export function resetUserRateLimits(): void {
  for (const limiter of Object.values(USER_RATE_LIMITS)) limiter.reset();
}
