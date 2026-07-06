// Client-side pre-checks for the signup form. Firebase enforces its own rules
// server-side; this is for instant, friendly feedback.
export function validateSignup(
  email: string,
  password: string
): { ok: true } | { ok: false; error: string } {
  const e = email.trim();
  if (!e) return { ok: false, error: 'Enter your email address.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Enter a valid email address.' };
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
  return { ok: true };
}
