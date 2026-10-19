import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time checks for shared secrets (cron bearer, webhook tokens). Both
// sides are hashed first so neither the comparison time nor an early length
// mismatch says how much of a guess was right.

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** True only when both are non-empty strings and equal. */
export function secretsMatch(supplied: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !supplied || !expected) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

/** True when an Authorization header is exactly `Bearer <secret>`. */
export function bearerMatches(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  return secretsMatch(header.slice(7), secret);
}
