import { describe, it, expect } from 'vitest';
import {
  resolveRoles,
  RoleDisplayNames,
  LIGHT_VETTING_ROLES,
  MANAGEMENT_FIELD_ROLES,
} from './auth';

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
