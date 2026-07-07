import { describe, expect, it } from 'vitest';
import { contrastRatio, getAuthorColor, getInitials } from '../authorColor';

// Matches the app's dark-theme surface (see .dark tokens in src/app/globals.css).
const DARK_SURFACE = '#0b1424';

describe('getInitials', () => {
  it('uses first letter of first + last word for two-word names', () => {
    expect(getInitials('Jane Doe')).toBe('JD');
  });

  it('uses only the first letter for a single-word name', () => {
    expect(getInitials('Cher')).toBe('C');
  });

  it('collapses extra whitespace between words', () => {
    expect(getInitials('  Jane   Middle   Doe  ')).toBe('JD');
  });

  it('returns "?" for empty or whitespace-only input', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });
});

describe('getAuthorColor', () => {
  it('is deterministic for the same id', () => {
    expect(getAuthorColor('user-123')).toEqual(getAuthorColor('user-123'));
  });

  it('maps different representative ids across multiple distinct entries', () => {
    const ids = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7'];
    const bgs = new Set(ids.map((id) => getAuthorColor(id).bg));
    expect(bgs.size).toBeGreaterThan(1);
  });

  it('does not throw for an empty id', () => {
    expect(() => getAuthorColor('')).not.toThrow();
    expect(getAuthorColor('')).toEqual(getAuthorColor(''));
  });
});

describe('palette contrast', () => {
  // Sample enough ids to exercise every palette entry (10 entries).
  const sampleIds = Array.from({ length: 200 }, (_, i) => `sample-${i}`);
  const entries = Array.from(new Map(sampleIds.map((id) => [getAuthorColor(id).bg, getAuthorColor(id)])).values());

  it('covers all 10 palette entries', () => {
    expect(entries.length).toBe(10);
  });

  it.each(entries)('entry %o meets WCAG AA contrast in every mode', ({ bg, fg, name, nameDark }) => {
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', name)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK_SURFACE, nameDark)).toBeGreaterThanOrEqual(4.5);
  });
});
