import { describe, expect, it } from 'vitest';
import { bearerMatches, secretsMatch } from './secretCompare';

describe('secretsMatch', () => {
  it('matches equal secrets only', () => {
    expect(secretsMatch('s3cret-value', 's3cret-value')).toBe(true);
    expect(secretsMatch('s3cret-valuf', 's3cret-value')).toBe(false);
    expect(secretsMatch('s3cret', 's3cret-value')).toBe(false);
  });

  it('never matches an empty or missing side', () => {
    expect(secretsMatch('', '')).toBe(false);
    expect(secretsMatch(null, 'x')).toBe(false);
    expect(secretsMatch('x', undefined)).toBe(false);
  });
});

describe('bearerMatches', () => {
  it('needs the exact Bearer form', () => {
    expect(bearerMatches('Bearer abc', 'abc')).toBe(true);
    expect(bearerMatches('bearer abc', 'abc')).toBe(false);
    expect(bearerMatches('abc', 'abc')).toBe(false);
    expect(bearerMatches('Bearer ', '')).toBe(false);
    expect(bearerMatches(null, 'abc')).toBe(false);
  });
});
