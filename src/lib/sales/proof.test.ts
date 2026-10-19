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
  it('true when the screenshot list has a path', () => {
    expect(hasSaleProof({ proofScreenshotPaths: ['form-attachments/u/sale-proof/a/', 'form-attachments/u/sale-proof/b/'] })).toBe(true);
  });
  it('true for a list-only sale with a blank legacy field', () => {
    expect(hasSaleProof({ proofScreenshotPaths: ['form-attachments/u/sale-proof/a/'], proofScreenshotPath: '' })).toBe(true);
  });
  it('false when the list holds only blanks', () => {
    expect(hasSaleProof({ orderNumberOrBtn: '', proofScreenshotPaths: ['', '  '] })).toBe(false);
  });
  it('false for an empty list and no order number', () => {
    expect(hasSaleProof({ proofScreenshotPaths: [] })).toBe(false);
  });
  it('true for a numeric order number from the raw JSON body', () => {
    expect(hasSaleProof({ orderNumberOrBtn: 1001 })).toBe(true);
  });
  it('does not throw on a non-string order number shape', () => {
    expect(() => hasSaleProof({ orderNumberOrBtn: { x: 1 } as unknown as string })).not.toThrow();
    expect(hasSaleProof({ orderNumberOrBtn: { x: 1 } as unknown as string })).toBe(false);
    expect(hasSaleProof({ orderNumberOrBtn: null })).toBe(false);
  });
});
