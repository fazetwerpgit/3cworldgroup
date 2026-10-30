import { describe, expect, it } from 'vitest';
import { canCheck, isWaitingOnYou, itemLine, itemState, oldestUpload, signedWithoutCopy, type ChecklistItem } from './checklist';

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

describe('isWaitingOnYou', () => {
  it('is an upload to check or a signature document that never went out', () => {
    expect(isWaitingOnYou(item({ itemId: 'dl_photos', referenceKind: 'storage', status: 'submitted' }))).toBe(true);
    expect(isWaitingOnYou(item({ status: 'submitted', esignEnvelopeId: null }))).toBe(true);
  });

  it('is off once out for signature, on hold, or handled', () => {
    expect(isWaitingOnYou(item({ status: 'submitted' }))).toBe(false);
    expect(isWaitingOnYou(item({ itemId: 'dl_photos', status: 'submitted', onHold: true }))).toBe(false);
    expect(isWaitingOnYou(item({ itemId: 'dl_photos', status: 'approved' }))).toBe(false);
  });
});

describe('a sensitive upload the caller cannot approve (operations)', () => {
  const license = (overrides: Partial<ChecklistItem> = {}) =>
    item({
      itemId: 'dl_photos',
      itemLabel: "Driver's License",
      referenceKind: 'storage',
      sensitive: true,
      status: 'submitted',
      submittedAt: '2026-07-26T00:00:00.000Z',
      esignEnvelopeId: null,
      ...overrides,
    });

  it('is not waiting on them and cannot be checked by them', () => {
    expect(canCheck(license({ adminOnly: true }))).toBe(false);
    expect(isWaitingOnYou(license({ adminOnly: true }))).toBe(false);
    expect(canCheck(license())).toBe(true);
    expect(isWaitingOnYou(license())).toBe(true);
  });

  it('does not age their To do row', () => {
    const person = { userId: 'u1', userName: 'One', toReview: 0, items: [license({ adminOnly: true })] };
    expect(oldestUpload(person)).toBeNull();
    expect(oldestUpload({ ...person, items: [license()] })).toBe('2026-07-26T00:00:00.000Z');
  });

  it('says it is waiting on an admin', () => {
    const now = new Date('2026-07-26T00:00:00.000Z').getTime();
    expect(itemLine(license({ adminOnly: true }), now)).toBe('Uploaded just now · waiting on an admin');
    expect(itemLine(license(), now)).toBe('Uploaded just now');
  });
});

describe('itemState', () => {
  const now = new Date('2026-10-29T12:00:00Z').getTime();
  it('says where an item stands in a few words', () => {
    expect(itemState(item({ esignEnvelopeId: null, hasSignedPdf: true, reviewedAt: '2026-10-28T15:00:00Z' }), now)).toBe('Approved Oct 28');
    expect(itemState(item({ reviewedAt: '2025-03-02T15:00:00Z' }), now)).toBe('Approved Mar 2, 2025');
    expect(itemState(item({ status: 'pending' as ChecklistItem['status'] }), now)).toBe('Not started');
    expect(itemState(item({ status: 'rejected' }), now)).toBe('Sent back');
    const upload = item({ itemId: 'drivers_license', referenceKind: 'storage', status: 'submitted', esignEnvelopeId: null });
    expect(itemState(upload, now)).toBe('To check');
    expect(itemState({ ...upload, adminOnly: true }, now)).toBe('Waiting on an admin');
    expect(itemState({ ...upload, onHold: true }, now)).toBe('On hold');
  });
});
