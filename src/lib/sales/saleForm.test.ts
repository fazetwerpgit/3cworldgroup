import { describe, expect, it } from 'vitest';
import { editInstallDateError } from './saleForm';

describe('editInstallDateError', () => {
  it('blocks clearing an install date the sale already has', () => {
    expect(editInstallDateError('2026-10-01', '')).toMatch(/cannot be cleared/);
  });

  it('allows moving the install date to another day', () => {
    expect(editInstallDateError('2026-10-01', '2026-10-05')).toBeNull();
  });

  it('allows leaving an unset install date empty, or setting one', () => {
    expect(editInstallDateError('', '')).toBeNull();
    expect(editInstallDateError('', '2026-10-05')).toBeNull();
  });
});
