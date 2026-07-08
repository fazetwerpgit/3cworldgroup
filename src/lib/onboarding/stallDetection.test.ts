import { describe, it, expect } from 'vitest';
import { dueNudges } from './stallDetection';

const HOUR = 3600 * 1000;
const now = new Date('2026-07-08T12:00:00Z');
const idleFor = (h: number) => new Date(now.getTime() - h * HOUR);

describe('dueNudges', () => {
  it('nothing due under 24h idle', () => {
    expect(dueNudges(idleFor(23), now, [])).toEqual([]);
  });

  it('h24 due after a day idle', () => {
    expect(dueNudges(idleFor(25), now, [])).toEqual(['h24']);
  });

  it('does not resend an already-sent tier', () => {
    expect(dueNudges(idleFor(25), now, ['h24'])).toEqual([]);
  });

  it('returns all overdue unsent tiers after a week', () => {
    expect(dueNudges(idleFor(7 * 24 + 1), now, ['h24'])).toEqual(['h72', 'd7']);
  });
});
