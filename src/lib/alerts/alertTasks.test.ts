import { describe, it, expect } from 'vitest';
import { shouldRenag } from './alertTasks';

const HOUR = 3600 * 1000;

describe('shouldRenag', () => {
  const now = new Date('2026-07-08T12:00:00Z');

  it('re-nags open tasks 24h after creation', () => {
    expect(shouldRenag({ status: 'open', createdAt: new Date(now.getTime() - 25 * HOUR) }, now)).toBe(true);
    expect(shouldRenag({ status: 'open', createdAt: new Date(now.getTime() - 23 * HOUR) }, now)).toBe(false);
  });

  it('uses lastNaggedAt when present', () => {
    const task = {
      status: 'open' as const,
      createdAt: new Date(now.getTime() - 100 * HOUR),
      lastNaggedAt: new Date(now.getTime() - 2 * HOUR),
    };
    expect(shouldRenag(task, now)).toBe(false);
  });

  it('never re-nags claimed or resolved tasks', () => {
    const old = new Date(now.getTime() - 100 * HOUR);
    expect(shouldRenag({ status: 'claimed', createdAt: old }, now)).toBe(false);
    expect(shouldRenag({ status: 'resolved', createdAt: old }, now)).toBe(false);
  });
});
