/*
  Field rules shared by the public Apply and Contact forms and their API
  routes, so the browser rejects exactly what the server would.

  Limits are in code points. A browser's `maxLength` counts UTF-16 units, which
  is never fewer, so an input capped at the same number can never reach the
  server's cut.
*/

export const PUBLIC_FIELD_LIMITS = {
  name: 200,
  email: 180,
  phone: 60,
  city: 120,
  referredBy: 180,
  message: 4000,
} as const;

export const INVALID_EMAIL_MESSAGE = 'Enter a valid email address.';
export const INVALID_PHONE_MESSAGE = 'Enter a valid phone number.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARACTERS = /^[\d\s().+-]+$/;

export function isValidEmail(value: string): boolean {
  return value.length <= PUBLIC_FIELD_LIMITS.email && EMAIL_PATTERN.test(value);
}

/** A US number: 10 digits once punctuation is stripped, or 11 with a leading 1. */
export function isValidUsPhone(value: string): boolean {
  if (!PHONE_CHARACTERS.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

/** Cuts to `max` code points, so a surrogate pair is never split in half. */
export function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  const codePoints = Array.from(value);
  return codePoints.length > max ? codePoints.slice(0, max).join('') : value;
}

/** The JSON object a public form posted, or null for a body that is not one. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
