/**
 * Which portal page started a Google Calendar sign-in, so the callback lands
 * back on it: Admin > Solar > Setup, or the consultant's own My availability.
 * A fixed name, never a path: the callback maps it to one of two fixed paths,
 * and anything else reads as 'setup'. Client safe (no server imports).
 */
export type ConnectReturn = 'setup' | 'availability';

export const connectReturnOf = (value: unknown): ConnectReturn => (value === 'availability' ? 'availability' : 'setup');
