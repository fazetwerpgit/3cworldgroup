import { createRateLimiter } from '@/lib/rateLimit';

/**
 * Screenshot reads per rep: 60 per 10 minutes. A rep logs one sale in minutes,
 * but "Log several" reads a whole batch (up to 50) at once, plus a few re-reads.
 */
export const scanLimiter = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });
