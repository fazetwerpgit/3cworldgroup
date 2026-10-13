import { describe, expect, it } from 'vitest';
import { changePct, changeText, channelParts, searchErrorText, timeAgo, totalOf } from './searchCardFormat';
import { emptyCounts } from './ownerSearchStats';

describe('channelParts', () => {
  it('shows Google always and other channels only above zero', () => {
    const parts = channelParts({ ...emptyCounts(), direct: 3, other: 1, unknown: 2 });
    expect(parts.map((p) => `${p.name} ${p.count}`)).toEqual(['Google 0', 'Direct 3', 'Other 1', 'Unknown 2']);
    expect(totalOf({ ...emptyCounts(), direct: 3, other: 1, unknown: 2 })).toBe(6);
  });
});

describe('change', () => {
  it('needs both weeks and a non-zero prior', () => {
    expect(changePct(18, 12)).toBe(50);
    expect(changePct(18, 0)).toBeNull();
    expect(changePct(18, undefined)).toBeNull();
    expect(changeText(50)).toBe('+50%');
    expect(changeText(-5)).toBe('−5%');
    expect(changeText(0)).toBe('0%');
  });
});

describe('wording', () => {
  it('says why the numbers are missing', () => {
    expect(searchErrorText('no_access')).toBe('Waiting on Search Console access');
    expect(searchErrorText('api_disabled')).toBe('Search Console API is off');
    expect(searchErrorText('HTTP 500: Backend Error')).toBe('Search Console update failed');
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(timeAgo('2026-10-13T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-13T11:48:00Z', now)).toBe('12m ago');
    expect(timeAgo('2026-10-13T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-10-12T11:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('2026-10-10T11:00:00Z', now)).toBe('3 days ago');
    expect(timeAgo(null, now)).toBeNull();
  });
});
