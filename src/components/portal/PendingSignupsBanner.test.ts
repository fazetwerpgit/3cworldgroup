import { describe, expect, it } from 'vitest';
import { pendingSignupsLabel } from './PendingSignupsBanner';

describe('pendingSignupsLabel', () => {
  it('pluralizes for zero and multiple', () => {
    expect(pendingSignupsLabel(0)).toBe('0 signups awaiting approval');
    expect(pendingSignupsLabel(2)).toBe('2 signups awaiting approval');
  });

  it('is singular for exactly one', () => {
    expect(pendingSignupsLabel(1)).toBe('1 signup awaiting approval');
  });
});
