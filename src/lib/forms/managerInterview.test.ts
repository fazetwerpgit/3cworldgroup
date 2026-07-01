import { describe, it, expect } from 'vitest';
import { isPromotionRole, validateSignatureDataUrl, isEmailShaped } from './managerInterview';

describe('isPromotionRole', () => {
  it('Account Executive is not a promotion', () => {
    expect(isPromotionRole('Account Executive')).toBe(false);
  });
  it('manager/other roles are promotions', () => {
    expect(isPromotionRole('L1 Manager')).toBe(true);
    expect(isPromotionRole('L2 Manager')).toBe(true);
    expect(isPromotionRole('Director')).toBe(true);
  });
  it('empty is not a promotion', () => {
    expect(isPromotionRole('')).toBe(false);
  });
});

describe('validateSignatureDataUrl', () => {
  it('accepts a small png data url', () => {
    expect(validateSignatureDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')).toBe(true);
  });
  it('rejects non-png / non-data-url', () => {
    expect(validateSignatureDataUrl('data:image/jpeg;base64,xxxx')).toBe(false);
    expect(validateSignatureDataUrl('https://evil.example/x.png')).toBe(false);
    expect(validateSignatureDataUrl('')).toBe(false);
    expect(validateSignatureDataUrl(null)).toBe(false);
    expect(validateSignatureDataUrl(123)).toBe(false);
  });
  it('rejects a signature whose decoded PNG exceeds 200 KB', () => {
    // base64 encodes 3 bytes per 4 chars, so to exceed 200 KB decoded we need
    // more than ~200*1024*4/3 chars of payload.
    const big = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((200 * 1024 * 4) / 3) + 8);
    expect(validateSignatureDataUrl(big)).toBe(false);
  });
  it('accepts a signature near but under 200 KB decoded (byte count, not char count)', () => {
    // ~150 KB of base64 chars decodes to ~112 KB — comfortably under the cap.
    const ok = 'data:image/png;base64,' + 'A'.repeat(150 * 1024);
    expect(validateSignatureDataUrl(ok)).toBe(true);
  });
});

describe('isEmailShaped', () => {
  it('accepts a normal email', () => {
    expect(isEmailShaped('manager@3cworld.com')).toBe(true);
  });
  it('rejects obvious non-emails', () => {
    expect(isEmailShaped('x')).toBe(false);
    expect(isEmailShaped('not-an-email')).toBe(false);
    expect(isEmailShaped('a@b')).toBe(false);
    expect(isEmailShaped('a b@c.com')).toBe(false);
    expect(isEmailShaped('')).toBe(false);
  });
});
