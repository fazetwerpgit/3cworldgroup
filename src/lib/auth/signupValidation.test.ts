import { describe, it, expect } from 'vitest';
import { validateSignup, teamCodeGateError, TEAM_CODE_RATE_LIMIT_ERROR } from './signupValidation';

describe('validateSignup', () => {
  it('accepts a valid name + email + 6+ char password', () => {
    expect(validateSignup('rep@3cworldgroup.com', 'secret1', 'Jane Rep').ok).toBe(true);
  });
  it('rejects an empty name', () => {
    expect(validateSignup('rep@3cworldgroup.com', 'secret1', '  ')).toEqual({ ok: false, error: 'Enter your full name.' });
  });
  it('rejects an empty email', () => {
    expect(validateSignup('', 'secret1', 'Jane Rep')).toEqual({ ok: false, error: 'Enter your email address.' });
  });
  it('rejects an email with no @', () => {
    expect(validateSignup('nope', 'secret1', 'Jane Rep')).toEqual({ ok: false, error: 'Enter a valid email address.' });
  });
  it('rejects a short password', () => {
    expect(validateSignup('rep@x.com', '123', 'Jane Rep')).toEqual({ ok: false, error: 'Password must be at least 6 characters.' });
  });
});

describe('teamCodeGateError', () => {
  const WRONG = "That team code isn't right. Ask your manager for the current one.";
  it('passes a valid team code', () => {
    expect(teamCodeGateError(200, { ok: true }, false, WRONG)).toBeNull();
  });
  it('reports a wrong code (403) as the gate error', () => {
    expect(teamCodeGateError(403, { ok: false }, false, WRONG)).toBe(WRONG);
  });
  it('reports a 429 rate limit with the server message, not "wrong code"', () => {
    const msg = 'Too many attempts. Try again in a few minutes.';
    expect(teamCodeGateError(429, { ok: false, error: msg }, false, WRONG)).toBe(msg);
  });
  it('falls back to a rate-limit message when a 429 has no usable body', () => {
    expect(teamCodeGateError(429, {}, true, WRONG)).toBe(TEAM_CODE_RATE_LIMIT_ERROR);
  });
  it('rejects an invite that is not open', () => {
    expect(teamCodeGateError(200, { ok: true, state: 'used' }, true, WRONG)).toBe(WRONG);
    expect(teamCodeGateError(200, { ok: true, state: 'open' }, true, WRONG)).toBeNull();
  });
});
