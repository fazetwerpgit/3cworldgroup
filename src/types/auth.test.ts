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
    expect(INVITABLE_FIELD_ROLES).toHaveLength(8);
    for (const role of INVITABLE_FIELD_ROLES) {
      expect(roleRequiresOnboarding(role)).toBe(true);
    }
  });

  it('names exactly the eight roles the recruiting form offers', () => {
    expect([...INVITABLE_FIELD_ROLES].sort()).toEqual(
      [
        'entry_level_rep',
        'entry_rep',
        'ibo_level_1',
        'ibo_level_2',
        'ibo_level_3',
        'ibo_level_4',
        'l1_manager',
        'l2_manager',
      ].sort()
    );
  });

  it('is false for roles that are not invite targets', () => {
    expect(roleRequiresOnboarding('general_manager')).toBe(false);
    expect(roleRequiresOnboarding('gm_in_training')).toBe(false);
    expect(roleRequiresOnboarding('office_manager')).toBe(false);
  });

  it('is false when no field role is present', () => {
    expect(roleRequiresOnboarding()).toBe(false);
  });
});

describe('graduatedFieldRole', () => {
  it('promotes an entry level rep to Account Executive', () => {
    expect(graduatedFieldRole('entry_level_rep')).toBe('entry_rep');
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
    expect(LIGHT_VETTING_ROLES).toEqual(['general_manager', 'gm_in_training', 'office_manager']);
  });
});
