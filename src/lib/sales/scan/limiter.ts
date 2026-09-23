import { createRateLimiter } from '@/lib/rateLimit';

/** Screenshot reads per rep: 20 per 10 minutes (a rep logs a sale in minutes, not seconds). */
export const scanLimiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });
