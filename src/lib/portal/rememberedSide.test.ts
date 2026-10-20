// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_SIDE_KEY, SALES_SIDE_KEY, readSide, writeSide } from './rememberedSide';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('remembered Fiber | Solar side', () => {
  it('defaults to fiber and reads back what was written, per key', () => {
    expect(readSide(BOARD_SIDE_KEY)).toBe('fiber');
    writeSide(BOARD_SIDE_KEY, 'solar');
    expect(readSide(BOARD_SIDE_KEY)).toBe('solar');
    expect(readSide(SALES_SIDE_KEY)).toBe('fiber');
    writeSide(BOARD_SIDE_KEY, 'fiber');
    expect(readSide(BOARD_SIDE_KEY)).toBe('fiber');
  });

  it('treats anything but "solar" as fiber', () => {
    window.localStorage.setItem(BOARD_SIDE_KEY, 'SOLAR');
    expect(readSide(BOARD_SIDE_KEY)).toBe('fiber');
  });

  it('falls back to fiber when storage throws, and writing never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readSide(BOARD_SIDE_KEY)).toBe('fiber');
    expect(() => writeSide(BOARD_SIDE_KEY, 'solar')).not.toThrow();
  });
});
