import { describe, expect, it } from 'vitest';
import { fieldLabelWithOptional } from './fieldLabel';

describe('fieldLabelWithOptional', () => {
  it('leaves a required label alone', () => {
    expect(fieldLabelWithOptional('Routing number', true)).toBe('Routing number');
  });

  it('appends the suffix to an optional label', () => {
    expect(fieldLabelWithOptional('Business name', false)).toBe('Business name (optional)');
  });

  it.each([
    ['Business name (optional)'],
    ['Business name (Optional)'],
    ['Business name (OPTIONAL)'],
  ])('does not repeat a suffix the label already carries: %s', (label) => {
    expect(fieldLabelWithOptional(label, false)).toBe(label);
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(fieldLabelWithOptional('  Business name (optional)  ', false)).toBe(
      'Business name (optional)'
    );
  });

  it('still appends when "optional" appears mid-label', () => {
    expect(fieldLabelWithOptional('Optional contact', false)).toBe('Optional contact (optional)');
  });
});
