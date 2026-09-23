import { describe, it, expect } from 'vitest';
import { countNewArrivals, newestDeliveredId } from './unseen';

const m = (id: string, authorId = 'other', pendingState?: 'sending' | 'failed') => ({ id, authorId, pendingState });

describe('new-messages pill math', () => {
  it('ignores pending echoes when finding the newest delivered message', () => {
    expect(newestDeliveredId([m('a'), m('b'), m('e1', 'me', 'failed')])).toBe('b');
    expect(newestDeliveredId([m('e1', 'me', 'sending')])).toBeUndefined();
  });

  it('counts arrivals that land above a pending echo', () => {
    const before = [m('a'), m('b'), m('e1', 'me', 'failed')];
    const after = [m('a'), m('b'), m('c'), m('d'), m('e1', 'me', 'failed')];
    expect(countNewArrivals(after, newestDeliveredId(before), 'me')).toBe(2);
  });

  it('does not count the reader’s own messages or a history prepend', () => {
    expect(countNewArrivals([m('a'), m('b'), m('c', 'me')], 'b', 'me')).toBe(0);
    expect(countNewArrivals([m('x'), m('y'), m('a'), m('b')], 'b', 'me')).toBe(0);
  });

  it('gives 0 when the previous newest is gone', () => {
    expect(countNewArrivals([m('a'), m('c')], 'b', 'me')).toBe(0);
    expect(countNewArrivals([m('a')], undefined, 'me')).toBe(0);
  });
});
