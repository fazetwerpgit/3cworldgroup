import { describe, expect, it } from 'vitest';
import { canSeeSolar } from './access';

describe('canSeeSolar', () => {
  it('allows any solar role', () => {
    expect(canSeeSolar({ solarRole: 'entry_canvasser' })).toBe(true);
    expect(canSeeSolar({ solarRole: 'sales_director', role: undefined })).toBe(true);
  });
  it('allows admin and owner without a solar role', () => {
    expect(canSeeSolar({ role: 'admin' })).toBe(true);
    expect(canSeeSolar({ role: 'owner', solarRole: null })).toBe(true);
  });
  it('denies fiber reps, operations, unknown roles and nobody', () => {
    expect(canSeeSolar({ role: 'operations' })).toBe(false);
    expect(canSeeSolar({ solarRole: null })).toBe(false);
    expect(canSeeSolar({ solarRole: 'bogus' })).toBe(false);
    expect(canSeeSolar(null)).toBe(false);
  });
});
