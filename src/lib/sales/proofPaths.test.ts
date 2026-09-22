import { describe, it, expect } from 'vitest';
import {
  MAX_PROOF_SCREENSHOTS,
  isOwnSaleProofPath,
  newProofSlot,
  proofPathFields,
  saleProofPaths,
  saleProofPrefix,
  validateProofPaths,
} from './proofPaths';

const A = 'form-attachments/u1/sale-proof/slot_aaaaaa/';
const B = 'form-attachments/u1/sale-proof/slot_bbbbbb/';

describe('saleProofPaths', () => {
  it('reads the array', () => {
    expect(saleProofPaths({ proofScreenshotPaths: [A, B] })).toEqual([A, B]);
  });
  it('reads a legacy sale with only the single field', () => {
    expect(saleProofPaths({ proofScreenshotPath: A })).toEqual([A]);
  });
  it('de-duplicates the mirrored first path', () => {
    expect(saleProofPaths({ proofScreenshotPaths: [A, B], proofScreenshotPath: A })).toEqual([A, B]);
  });
  it('appends a legacy path that is not in the array', () => {
    expect(saleProofPaths({ proofScreenshotPaths: [B], proofScreenshotPath: A })).toEqual([B, A]);
  });
  it('trims and drops blanks and non-strings', () => {
    expect(saleProofPaths({ proofScreenshotPaths: [` ${A} `, '', '  ', 7], proofScreenshotPath: '' })).toEqual([A]);
  });
  it('is empty for no proof or a non-array value', () => {
    expect(saleProofPaths({})).toEqual([]);
    expect(saleProofPaths({ proofScreenshotPaths: A })).toEqual([]);
  });
});

describe('saleProofPrefix / isOwnSaleProofPath', () => {
  it('builds the per-rep prefix', () => {
    expect(saleProofPrefix('u1')).toBe('form-attachments/u1/sale-proof/');
  });
  it("accepts the rep's own sale-proof folder", () => {
    expect(isOwnSaleProofPath(A, 'u1')).toBe(true);
  });
  it("rejects another rep's folder, another form type, traversal and a blank uid", () => {
    expect(isOwnSaleProofPath(A, 'u2')).toBe(false);
    expect(isOwnSaleProofPath('form-attachments/u1/leads-request/x/', 'u1')).toBe(false);
    expect(isOwnSaleProofPath('form-attachments/u1/sale-proof/../../u2/sale-proof/x/', 'u1')).toBe(false);
    expect(isOwnSaleProofPath('form-attachments//sale-proof/x/', '')).toBe(false);
  });
});

describe('validateProofPaths', () => {
  it('accepts an array of own paths', () => {
    expect(validateProofPaths({ proofScreenshotPaths: [A, B] }, 'u1')).toEqual({ ok: true, paths: [A, B] });
  });
  it('accepts the legacy single field alone', () => {
    expect(validateProofPaths({ proofScreenshotPath: A }, 'u1')).toEqual({ ok: true, paths: [A] });
  });
  it('accepts no proof at all as an empty list', () => {
    expect(validateProofPaths({}, 'u1')).toEqual({ ok: true, paths: [] });
    expect(validateProofPaths({ proofScreenshotPaths: null, proofScreenshotPath: null }, 'u1')).toEqual({ ok: true, paths: [] });
  });
  it('accepts exactly the cap', () => {
    const paths = Array.from({ length: MAX_PROOF_SCREENSHOTS }, (_, i) => `form-attachments/u1/sale-proof/s${i}_000000/`);
    expect(validateProofPaths({ proofScreenshotPaths: paths }, 'u1').ok).toBe(true);
  });
  it('rejects one over the cap', () => {
    const paths = Array.from({ length: MAX_PROOF_SCREENSHOTS + 1 }, (_, i) => `form-attachments/u1/sale-proof/s${i}_000000/`);
    const result = validateProofPaths({ proofScreenshotPaths: paths }, 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 4/);
  });
  it('counts a legacy path outside the array toward the cap', () => {
    const paths = Array.from({ length: MAX_PROOF_SCREENSHOTS }, (_, i) => `form-attachments/u1/sale-proof/s${i}_000000/`);
    expect(validateProofPaths({ proofScreenshotPaths: paths, proofScreenshotPath: A }, 'u1').ok).toBe(false);
  });
  it('rejects the whole list when any one path is foreign or climbs out', () => {
    expect(validateProofPaths({ proofScreenshotPaths: [A, 'form-attachments/u2/sale-proof/x/'] }, 'u1').ok).toBe(false);
    expect(validateProofPaths({ proofScreenshotPaths: [A, 'form-attachments/u1/sale-proof/../x/'] }, 'u1').ok).toBe(false);
    expect(validateProofPaths({ proofScreenshotPath: 'form-attachments/u2/sale-proof/x/' }, 'u1').ok).toBe(false);
  });
  it('rejects malformed shapes', () => {
    expect(validateProofPaths({ proofScreenshotPaths: A }, 'u1').ok).toBe(false);
    expect(validateProofPaths({ proofScreenshotPaths: [A, 3] }, 'u1').ok).toBe(false);
    expect(validateProofPaths({ proofScreenshotPath: 5 }, 'u1').ok).toBe(false);
  });
});

describe('proofPathFields', () => {
  it('mirrors the first path into the legacy field', () => {
    expect(proofPathFields([A, B])).toEqual({ proofScreenshotPaths: [A, B], proofScreenshotPath: A });
  });
  it('writes an empty legacy field for no screenshots', () => {
    expect(proofPathFields([])).toEqual({ proofScreenshotPaths: [], proofScreenshotPath: '' });
  });
});

describe('newProofSlot', () => {
  const SLOT_RULE = /^[A-Za-z0-9_-]{8,64}$/;
  it('is the sale key plus a 6-hex suffix and fits the slot rule', () => {
    const key = 'abcdef0123456789abcdef0123456789';
    const slot = newProofSlot(key);
    expect(slot).toMatch(new RegExp(`^${key}_[0-9a-f]{6}$`));
    expect(slot).toMatch(SLOT_RULE);
  });
  it('gives each screenshot its own slot', () => {
    const slots = new Set(Array.from({ length: 20 }, () => newProofSlot('abcdef0123456789')));
    expect(slots.size).toBe(20);
  });
  it('truncates a long key so the slot stays within 64 chars', () => {
    const slot = newProofSlot('a'.repeat(100));
    expect(slot.length).toBeLessThanOrEqual(64);
    expect(slot).toMatch(SLOT_RULE);
  });
});
