import { createHmac } from 'node:crypto';
import { secretsMatch } from '@/lib/auth/secretCompare';

// A reCAPTCHA token can be verified with Google only once, so the captcha
// route hands the form a short-lived pass instead: an HMAC (keyed with the
// reCAPTCHA secret) over the signup email and an expiry. signup-notify checks
// it server-side, so a script that skips the form and the captcha raises no
// owner alert. Binding it to the email stops one pass serving many accounts.

export const CAPTCHA_PASS_TTL_MS = 10 * 60 * 1000;

const sign = (email: string, expiresAt: number, secret: string) =>
  createHmac('sha256', secret).update(`signup-captcha|${email.trim().toLowerCase()}|${expiresAt}`).digest('hex');

export function issueCaptchaPass(email: string, secret: string, now = Date.now()): string {
  const expiresAt = now + CAPTCHA_PASS_TTL_MS;
  return `${expiresAt}.${sign(email, expiresAt, secret)}`;
}

/** True only for an unexpired pass issued for this email under this secret. */
export function verifyCaptchaPass(pass: unknown, email: unknown, secret: string, now = Date.now()): boolean {
  if (typeof pass !== 'string' || typeof email !== 'string' || !email.trim() || !secret) return false;
  const match = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(pass);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now || expiresAt > now + CAPTCHA_PASS_TTL_MS) return false;
  return secretsMatch(match[2], sign(email, expiresAt, secret));
}
