import { describe, it, expect } from 'vitest';
import { isPromotionRole, validateSignatureDataUrl } from './managerInterview';

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
  it('rejects an over-size string', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(200 * 1024 + 1);
    expect(validateSignatureDataUrl(big)).toBe(false);
  });
});
