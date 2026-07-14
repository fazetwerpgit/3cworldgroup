// Client-side pre-checks for the signup form. Firebase enforces its own rules
// server-side; this is for instant, friendly feedback.
export function validateSignup(
  email: string,
  password: string,
  displayName: string,
  confirmPassword?: string
): { ok: true } | { ok: false; error: string } {
  const e = email.trim();
  const name = displayName.trim();
  if (!name) return { ok: false, error: 'Enter your full name.' };
  if (!e) return { ok: false, error: 'Enter your email address.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Enter a valid email address.' };
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
  // Confirm-password is a client-side-only affordance (member-the-line-goal.md
  // OPEN CALL 2 -> ship both, client-side only) — it never loosens or
  // tightens Firebase's real 6-char minimum, enforced above.
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match.' };
  }
  return { ok: true };
}

export type PasswordStrength = 'weak' | 'okay' | 'strong';

// Cosmetic, client-computed only — never sent to the server, never changes
// the real minimum-length rule enforced by Firebase Auth.
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 6) return 'weak';
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (hasSymbol && hasNumber && password.length >= 10) return 'strong';
  return 'okay';
}

export const PASSWORD_STRENGTH_LABEL: Record<PasswordStrength, string> = {
  weak: 'Weak — use 6+ characters',
  okay: 'Okay — add a symbol for strong',
  strong: 'Strong password',
};
