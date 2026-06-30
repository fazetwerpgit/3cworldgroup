import { describe, it, expect } from 'vitest';
import { FIBER_COMPANIES, EXPEDITE_REASONS, isValidOption } from './formOptions';

describe('form options', () => {
  it('has the exact Fiber companies', () => {
    expect(FIBER_COMPANIES).toEqual(['T-Fiber', 'Verizon', 'AT&T', 'Frontier', 'Spectrum']);
  });
  it('has the exact Expedite reasons', () => {
    expect(EXPEDITE_REASONS).toEqual([
      'Install too far out',
      'Tech missed install need install asap',
      'Customer no showed need it rescheduled asap',
    ]);
  });
  it('isValidOption accepts members and rejects non-members', () => {
    expect(isValidOption(FIBER_COMPANIES, 'Verizon')).toBe(true);
    expect(isValidOption(FIBER_COMPANIES, 'Comcast')).toBe(false);
  });
});
