import { describe, expect, it } from 'vitest';
import { envelopeLoadFailure } from './loadFailure';

describe('envelopeLoadFailure', () => {
  it("sends a rep back from someone else's document without a Retry", () => {
    expect(envelopeLoadFailure(403)).toEqual({ message: 'This document is on another account.', retry: false });
  });

  it('sends a rep back from a missing document without a Retry', () => {
    expect(envelopeLoadFailure(404).retry).toBe(false);
    expect(envelopeLoadFailure(404).message).toMatch(/no longer available/);
  });

  it('offers Retry for server errors, expired sign-ins and no signal', () => {
    for (const status of [500, 503, 401, null]) expect(envelopeLoadFailure(status).retry).toBe(true);
    expect(envelopeLoadFailure(null).message).toMatch(/No signal/);
  });
});
