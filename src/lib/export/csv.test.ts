import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

const cols = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
];

describe('toCsv', () => {
  it('emits a header row from labels', () => {
    expect(toCsv(cols, [])).toBe('Name,City');
  });
  it('emits values in column-key order', () => {
    expect(toCsv(cols, [{ city: 'Dallas', name: 'Jane' }])).toBe('Name,City\r\nJane,Dallas');
  });
  it('renders null/undefined/missing as empty', () => {
    expect(toCsv(cols, [{ name: null, city: undefined }])).toBe('Name,City\r\n,');
  });
  it('serializes Date as ISO', () => {
    const d = new Date('2026-06-30T12:00:00.000Z');
    expect(toCsv([{ key: 'when', label: 'When' }], [{ when: d }])).toBe('When\r\n2026-06-30T12:00:00.000Z');
  });
  it('quotes and escapes commas, quotes, and newlines', () => {
    const rows = [{ name: 'Doe, John', city: 'a "b" c' }];
    expect(toCsv(cols, rows)).toBe('Name,City\r\n"Doe, John","a ""b"" c"');
  });
  it('quotes fields containing newlines', () => {
    expect(toCsv([{ key: 'n', label: 'N' }], [{ n: 'line1\nline2' }])).toBe('N\r\n"line1\nline2"');
  });
});
