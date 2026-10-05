import { createRateLimiter } from '@/lib/rateLimit';

/** Team code guesses per IP: 10 per 10 minutes. The code is one shared word, so guessing must stay slow. */
export const teamCodeLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/** Signup owner alerts per IP: 10 per 10 minutes, the same pace the team code check allows. */
export const signupNotifyLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/**
 * Shared team code gate for portal self-signup.
 *
 * Managers hand this code to returning hires so they can register without a
 * recruiting invite. Job applicants who stumble onto /portal/signup do not
 * have it. Matching is case-insensitive and ignores surrounding whitespace.
 * An unset or blank expected code fails closed so a misconfigured deploy
 * never becomes an open signup.
 */
export function isValidTeamCode(input: unknown, expected: string | undefined): boolean {
  if (typeof input !== 'string') return false;
  const want = (expected ?? '').trim().toLowerCase();
  if (!want) return false;
  return input.trim().toLowerCase() === want;
}
