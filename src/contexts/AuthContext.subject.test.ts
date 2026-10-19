import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: null, db: null, isFirebaseConfigured: false }));

import { subjectAuthValue, type AuthContextType } from './AuthContext';
import type { User } from '@/types';

const owner = {
  user: { uid: 'owner-1', role: 'owner', displayName: 'Jacob' },
  loading: false,
  pendingApproval: false,
  hasPermission: () => true,
  isRole: () => true,
} as unknown as AuthContextType;

const noah = { uid: 'rep-noah', displayName: 'Noah Smith', email: 'noah@x.com', fieldRole: 'entry_rep', status: 'active' } as User;

describe('subjectAuthValue (owner viewing as a rep)', () => {
  const value = subjectAuthValue(owner, noah);

  it('is the rep, not the owner', () => {
    expect(value.user?.uid).toBe('rep-noah');
    expect(value.pendingApproval).toBe(false);
  });

  it("keeps the rep's read permissions and drops every write", () => {
    expect(value.hasPermission('sales:read')).toBe(true);
    expect(value.hasPermission('leaderboard:read')).toBe(true);
    expect(value.hasPermission('sales:write')).toBe(false);
    expect(value.hasPermission('chat:write')).toBe(false);
    // Not the owner's: admin-only reads are not the rep's either.
    expect(value.hasPermission('users:read')).toBe(false);
  });

  it("answers role checks as the rep (no admin, no owner)", () => {
    expect(value.isRole('entry_rep')).toBe(true);
    expect(value.isRole('admin', 'operations')).toBe(false);
    expect(value.isRole('owner')).toBe(false);
  });
});

describe('subjectAuthValue with a solar rep', () => {
  const sol = { uid: 'rep-sol', displayName: 'Sol Rep', fieldRole: 'ae_tier_1', solarRole: 'canvass_closer', status: 'active' } as User;
  const value = subjectAuthValue(owner, sol);

  it('answers solar:read from the solar role but never solar:write', () => {
    expect(value.hasPermission('solar:read')).toBe(true);
    expect(value.hasPermission('solar:write')).toBe(false);
  });

  it('gives a fiber-only rep no solar at all', () => {
    expect(subjectAuthValue(owner, noah).hasPermission('solar:read')).toBe(false);
  });
});
