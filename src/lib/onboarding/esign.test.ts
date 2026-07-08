import { describe, it, expect } from 'vitest';
import { ESIGN_ITEM_IDS, isEsignItem, ADOBE_SIGN_DASHBOARD_URL } from './esign';

describe('ESIGN_ITEM_IDS', () => {
  it('contains exactly the four esign items', () => {
    expect(new Set(ESIGN_ITEM_IDS)).toEqual(
      new Set(['contract', 'direct_deposit', 'pay_structure', 'fcra_auth'])
    );
  });
});

describe('isEsignItem', () => {
  it('is true for the esign items', () => {
    expect(isEsignItem('contract')).toBe(true);
    expect(isEsignItem('direct_deposit')).toBe(true);
    expect(isEsignItem('pay_structure')).toBe(true);
  });

  it('is false for non-esign items', () => {
    expect(isEsignItem('w9')).toBe(false);
    expect(isEsignItem('background_check')).toBe(false);
    expect(isEsignItem('onboarding_submission')).toBe(false);
    expect(isEsignItem('llc_sos')).toBe(false);
  });
});

describe('ADOBE_SIGN_DASHBOARD_URL', () => {
  it('is an absolute https adobesign url', () => {
    expect(ADOBE_SIGN_DASHBOARD_URL).toMatch(/^https:\/\/.*adobesign\.com/);
  });
});
