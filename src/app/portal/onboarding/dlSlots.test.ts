import { describe, expect, it } from 'vitest';
import { addDlSlot, dlReference, EMPTY_DL_SLOTS } from './dlSlots';

describe('addDlSlot', () => {
  it('keeps the front when the back finishes second from the same pick render', () => {
    // Both uploads were picked before either finished, so neither knew about the other.
    const afterFront = addDlSlot(EMPTY_DL_SLOTS, 'dl_photos', 'front', 'onboarding/u1/dl_photos/');
    const afterBack = addDlSlot(afterFront, 'dl_photos', 'back', 'onboarding/u1/dl_photos/');
    expect(afterBack).toEqual({ itemId: 'dl_photos', front: 'onboarding/u1/dl_photos/', back: 'onboarding/u1/dl_photos/' });
    expect(dlReference(afterBack, 'onboarding/u1/dl_photos/')).toBe('onboarding/u1/dl_photos/');
  });

  it('works in either finish order', () => {
    const afterBack = addDlSlot(EMPTY_DL_SLOTS, 'dl_photos', 'back', 'p/');
    const afterFront = addDlSlot(afterBack, 'dl_photos', 'front', 'p/');
    expect(dlReference(afterFront, 'p/')).toBe('p/');
  });

  it('starts fresh when the slots belong to another item', () => {
    const stale = { itemId: 'other', front: 'old/', back: 'old/' };
    const next = addDlSlot(stale, 'dl_photos', 'front', 'p/');
    expect(next).toEqual({ itemId: 'dl_photos', front: 'p/', back: '' });
    expect(dlReference(next, 'p/')).toBe('');
  });
});
