import { describe, it, expect } from 'vitest';
import { ESIGN_HELPER_TEXT, ESIGN_ITEM_IDS, isEsignItem } from './esign';

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

describe('ESIGN_HELPER_TEXT', () => {
  it('uses provider-neutral e-sign copy', () => {
    expect(ESIGN_HELPER_TEXT).toBe(
      "We've emailed you this document for e-signature. Check your inbox - it completes here automatically once signed."
    );
  });
});
