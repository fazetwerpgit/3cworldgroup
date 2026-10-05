import { describe, expect, it } from 'vitest';
import { onboardingFileItemStatus } from './onboardingFileStatus';

const esign = { referenceKind: 'esign' as const, onHold: false };

describe('onboarding file item status', () => {
  it('reads Out for signature only when an envelope exists and the item is unsigned', () => {
    expect(onboardingFileItemStatus({ ...esign, status: 'submitted', envelopeSent: true }).label).toBe(
      'Out for signature',
    );
    expect(onboardingFileItemStatus({ ...esign, status: 'submitted', envelopeSent: false }).label).toBe('Not sent yet');
    expect(onboardingFileItemStatus({ ...esign, status: 'not_started', envelopeSent: false }).label).toBe(
      'Not sent yet',
    );
    expect(onboardingFileItemStatus({ ...esign, status: 'approved', envelopeSent: true }).label).toBe('Approved');
  });

  it('keeps the other states as they are', () => {
    expect(
      onboardingFileItemStatus({ referenceKind: 'storage', onHold: false, status: 'submitted', envelopeSent: false })
        .label,
    ).toBe('Needs review');
    expect(
      onboardingFileItemStatus({ referenceKind: 'storage', onHold: false, status: 'not_started', envelopeSent: false })
        .label,
    ).toBe('Not started');
    expect(onboardingFileItemStatus({ ...esign, status: 'rejected', envelopeSent: true }).label).toBe('Rejected');
    expect(onboardingFileItemStatus({ ...esign, onHold: true, status: 'submitted', envelopeSent: true }).label).toBe(
      'On hold',
    );
  });
});
