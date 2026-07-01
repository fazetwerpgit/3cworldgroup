import { describe, expect, it } from 'vitest';
import { toggleReaction } from './reactions';

describe('toggleReaction', () => {
  it('adds a new emoji reaction', () => {
    const next = toggleReaction({}, '🔥', 'u1');
    expect(next.reactions).toEqual({ '🔥': ['u1'] });
    expect(next.reactionCounts).toEqual({ '🔥': 1 });
  });

  it('toggles an existing user reaction off', () => {
    const next = toggleReaction({ reactions: { '👏': ['u1'] }, reactionCounts: { '👏': 1 } }, '👏', 'u1');
    expect(next.reactions).toEqual({});
    expect(next.reactionCounts).toEqual({});
  });

  it('keeps multiple users on the same emoji consistent', () => {
    const next = toggleReaction({ reactions: { '✅': ['u1'] }, reactionCounts: { '✅': 1 } }, '✅', 'u2');
    expect(next.reactions).toEqual({ '✅': ['u1', 'u2'] });
    expect(next.reactionCounts).toEqual({ '✅': 2 });
  });

  it('caps uid arrays at 50 users', () => {
    const existing = Array.from({ length: 50 }, (_, index) => `u${index}`);
    const next = toggleReaction({ reactions: { '🎉': existing }, reactionCounts: { '🎉': 50 } }, '🎉', 'u-new');
    expect(next.reactions['🎉']).toHaveLength(50);
    expect(next.reactions['🎉']).not.toContain('u-new');
    expect(next.reactionCounts['🎉']).toBe(50);
  });

  it('keeps invalid reaction state sanitized and count-consistent', () => {
    const next = toggleReaction(
      { reactions: { nope: ['u1'], '😂': ['u1', 'u1', 'u2'] }, reactionCounts: { nope: 99, '😂': 12 } },
      'not-allowed',
      'u3'
    );
    expect(next.reactions).toEqual({ '😂': ['u1', 'u2'] });
    expect(next.reactionCounts).toEqual({ '😂': 2 });
  });
});
