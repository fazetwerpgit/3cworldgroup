import { describe, it, expect } from 'vitest';
import {
  INVITABLE_FIELD_ROLES,
  resolveRoles,
  RoleDisplayNames,
  LIGHT_VETTING_ROLES,
  MANAGEMENT_FIELD_ROLES,
  graduatedFieldRole,
  roleRequiresOnboarding,
} from './auth';

describe('roleRequiresOnboarding', () => {
  it('is true for every invitable field role', () => {
    expect(INVITABLE_FIELD_ROLES).toHaveLength(5);
    for (const role of INVITABLE_FIELD_ROLES) {
      expect(roleRequiresOnboarding(role)).toBe(true);
    }
  });

  it('names exactly the five roles the recruiting form offers', () => {
    expect([...INVITABLE_FIELD_ROLES].sort()).toEqual(
      ['ae_tier_1', 'ae_tier_2', 'director', 'entry_level_rep', 'regional_manager'].sort()
    );
  });

  it('is false for roles that are not invite targets', () => {
    expect(roleRequiresOnboarding('general_manager')).toBe(false);
    expect(roleRequiresOnboarding('gm_in_training')).toBe(false);
    expect(roleRequiresOnboarding('office_manager')).toBe(false);
    expect(roleRequiresOnboarding('internal_rep')).toBe(false);
  });

  // Retired invite targets: no longer offered to candidates, but hires already
  // mid-checklist on one of them keep their packet and their activation path.
  it('is still true for the retired legacy and IBO tiers', () => {
    for (const role of ['entry_rep', 'l1_manager', 'l2_manager', 'ibo_level_1'] as const) {
      expect(INVITABLE_FIELD_ROLES).not.toContain(role);
      expect(roleRequiresOnboarding(role)).toBe(true);
    }
  });

  it('is false when no field role is present', () => {
    expect(roleRequiresOnboarding()).toBe(false);
  });
});

describe('graduatedFieldRole', () => {
  it('promotes an entry level rep to Account Executive Tier 1', () => {
    expect(graduatedFieldRole('entry_level_rep')).toBe('ae_tier_1');
  });

  it('leaves every other role unchanged', () => {
    for (const role of INVITABLE_FIELD_ROLES) {
      if (role === 'entry_level_rep') continue;
      expect(graduatedFieldRole(role)).toBe(role);
    }
  });
});

describe('new field roles', () => {
  it('resolves the three new roles as field roles', () => {
    for (const r of ['general_manager', 'gm_in_training', 'office_manager']) {
      const { role, fieldRole } = resolveRoles(undefined, r);
      expect(role).toBeUndefined();
      expect(fieldRole).toBe(r);
    }
  });

  it('has display names for the new roles', () => {
    expect(RoleDisplayNames.general_manager).toBe('General Manager');
    expect(RoleDisplayNames.gm_in_training).toBe('GM in Training');
    expect(RoleDisplayNames.office_manager).toBe('Office Manager');
  });

  it('classifies management and light-vetting membership', () => {
    expect(MANAGEMENT_FIELD_ROLES).toContain('general_manager');
    expect(MANAGEMENT_FIELD_ROLES).toContain('office_manager');
    expect(MANAGEMENT_FIELD_ROLES).not.toContain('gm_in_training');
    expect(MANAGEMENT_FIELD_ROLES).toContain('regional_manager');
    expect(MANAGEMENT_FIELD_ROLES).toContain('director');
    expect(MANAGEMENT_FIELD_ROLES).not.toContain('ae_tier_2');
    expect(LIGHT_VETTING_ROLES).toEqual([
      'general_manager',
      'gm_in_training',
      'office_manager',
      'regional_manager',
      'director',
      'internal_rep',
    ]);
  });
});
