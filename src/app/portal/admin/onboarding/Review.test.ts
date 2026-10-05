import { describe, expect, it } from 'vitest';
import { signedWithoutCopy, type ChecklistItem } from './Review';

function item(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 'u1_contract',
    userId: 'u1',
    itemId: 'contract',
    itemLabel: 'Contract',
    category: 'documents' as ChecklistItem['category'],
    sensitive: false,
    adminOnly: false,
    referenceKind: 'esign',
    reference: null,
    files: [],
    status: 'approved',
    onHold: false,
    submittedAt: null,
    reviewedAt: null,
    reviewerName: null,
    rejectionReason: null,
    esignEnvelopeId: 'legacy-1',
    hasSignedPdf: false,
    manualCompletion: null,
    ...overrides,
  };
}

describe('signedWithoutCopy', () => {
  it('notes a signed document with no stored copy', () => {
    expect(signedWithoutCopy(item())).toBe(true);
  });

  it('is off when the stored copy exists, the item is unsigned, or it was marked complete by hand', () => {
    expect(signedWithoutCopy(item({ hasSignedPdf: true }))).toBe(false);
    expect(signedWithoutCopy(item({ status: 'submitted' }))).toBe(false);
    expect(signedWithoutCopy(item({ esignEnvelopeId: null }))).toBe(false);
    expect(
      signedWithoutCopy(item({ manualCompletion: { note: 'Signed on paper', byName: 'Owner', at: null } }))
    ).toBe(false);
  });
});
