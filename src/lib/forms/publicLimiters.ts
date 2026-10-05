import { createRateLimiter } from '@/lib/rateLimit';

// Per-IP caps on the unauthenticated website forms. Each submission alerts
// managers or emails owners, so a script must not be able to loop them. A real
// visitor sends one, maybe a retry.

/** /api/public/applications: 5 per 10 minutes. Also throttles the account_exists answer. */
export const applicationLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/** /api/public/contact: 5 per 10 minutes. */
export const contactLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });
