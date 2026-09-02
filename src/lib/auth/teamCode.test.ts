import { describe, it, expect } from 'vitest';
import { isValidTeamCode } from './teamCode';

describe('isValidTeamCode', () => {
  it('accepts an exact match', () => {
    expect(isValidTeamCode('3cteam', '3cteam')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isValidTeamCode('3CTEAM', '3cteam')).toBe(true);
    expect(isValidTeamCode('3cTeam', '3CTEAM')).toBe(true);
  });

  it('trims surrounding whitespace from the input', () => {
    expect(isValidTeamCode('  3cteam \n', '3cteam')).toBe(true);
  });

  it('rejects a wrong code', () => {
    expect(isValidTeamCode('3cteams', '3cteam')).toBe(false);
    expect(isValidTeamCode('', '3cteam')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidTeamCode(undefined, '3cteam')).toBe(false);
    expect(isValidTeamCode(123, '3cteam')).toBe(false);
    expect(isValidTeamCode(null, '3cteam')).toBe(false);
  });

  it('fails closed when the expected code is unset or blank', () => {
    expect(isValidTeamCode('3cteam', undefined)).toBe(false);
    expect(isValidTeamCode('', '')).toBe(false);
    expect(isValidTeamCode('   ', '   ')).toBe(false);
  });
});
