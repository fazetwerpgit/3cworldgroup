import { describe, expect, it } from 'vitest';
import { rowsSentence } from './LeadListUpload';

describe('rowsSentence', () => {
  it('says where every row went', () => {
    expect(
      rowsSentence({
        rows: 3486,
        rowsBreakdown: { houseRows: 596, apartmentRows: 2880, buildings: 134 },
        skipped: [{ reason: 'repeated-row', count: 10 }],
      })
    ).toBe('3,486 rows: 596 houses, 2,880 apartments in 134 buildings, 10 listed twice.');
  });

  it('names every left-out reason in plain words and leaves out empty parts', () => {
    expect(
      rowsSentence({
        rows: 11,
        rowsBreakdown: { houseRows: 1, apartmentRows: 0, buildings: 0 },
        skipped: [
          { reason: 'not-door-knock-allowed', count: 5 },
          { reason: 'no-coordinates', count: 3 },
          { reason: 'no-pack', count: 1 },
          { reason: 'repeated-row', count: 1 },
        ],
      })
    ).toBe('11 rows: 1 house, 5 not allowed to knock, 3 without a map location, 1 without a pack, 1 listed twice.');
  });
});
