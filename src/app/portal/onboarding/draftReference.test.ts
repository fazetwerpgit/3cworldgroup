import { describe, expect, it } from 'vitest';
import { draftReference } from './draftReference';

describe('draftReference', () => {
  it('never falls back to the returned upload on a resubmit', () => {
    const item = { id: 'dl_photos', reference: 'onboarding/invite_1/dl_photos/' };
    expect(draftReference(item, null, '')).toBe('');
    expect(draftReference(item, 'insurance', 'other/path')).toBe('');
  });

  it('sends the upload made in this sitting', () => {
    const item = { id: 'dl_photos', reference: 'onboarding/invite_1/dl_photos/' };
    expect(draftReference(item, 'dl_photos', 'onboarding/user_1/dl_photos/')).toBe('onboarding/user_1/dl_photos/');
  });

  it('starts a typed item from its current reference', () => {
    expect(draftReference({ id: 'onboarding_submission', reference: 'done' }, null, '')).toBe('done');
  });
});
