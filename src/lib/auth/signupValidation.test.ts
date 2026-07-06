import { describe, it, expect } from 'vitest';
import { validateSignup } from './signupValidation';

describe('validateSignup', () => {
  it('accepts a valid email + 6+ char password', () => {
    expect(validateSignup('rep@3cworldgroup.com', 'secret1').ok).toBe(true);
  });
  it('rejects an empty email', () => {
    expect(validateSignup('', 'secret1')).toEqual({ ok: false, error: 'Enter your email address.' });
  });
  it('rejects an email with no @', () => {
    expect(validateSignup('nope', 'secret1')).toEqual({ ok: false, error: 'Enter a valid email address.' });
  });
  it('rejects a short password', () => {
    expect(validateSignup('rep@x.com', '123')).toEqual({ ok: false, error: 'Password must be at least 6 characters.' });
  });
});
