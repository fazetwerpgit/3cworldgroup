import { describe, it, expect } from 'vitest';
import { hasSaleProof } from './proof';

describe('hasSaleProof', () => {
  it('true when order/BTN present', () => {
    expect(hasSaleProof({ orderNumberOrBtn: 'ABC123' })).toBe(true);
  });
  it('true when screenshot path present', () => {
    expect(hasSaleProof({ proofScreenshotPath: 'form-attachments/u/sale-proof/' })).toBe(true);
  });
  it('false when neither present', () => {
    expect(hasSaleProof({})).toBe(false);
  });
  it('false when both blank/whitespace', () => {
    expect(hasSaleProof({ orderNumberOrBtn: '   ', proofScreenshotPath: '' })).toBe(false);
  });
});
