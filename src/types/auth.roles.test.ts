import { describe, it, expect } from 'vitest';
import {
  FieldRoles,
  isAdminLevel,
  isManagementRole,
  isOwner,
  isPlatformRole,
  MANAGEMENT_PLATFORM_ROLES,
  PlatformRoles,
  resolveRoles,
  RoleDisplayNames,
  RolePermissions,
} from './auth';
import type { FieldRole, PlatformRole } from './auth';

const ALL_ROLES: (PlatformRole | FieldRole)[] = [
  ...(Object.values(PlatformRoles) as PlatformRole[]),
  ...(Object.values(FieldRoles) as FieldRole[]),
];

// The two Record<PlatformRole | FieldRole, …> maps are exhaustive at compile
// time, so a missing entry is a type error. What the compiler cannot catch is an
// entry that exists but is empty or blank, which reads as "role with no
// permissions" or an unlabelled segment in every role picker.
describe('every role is fully described', () => {
  it.each(ALL_ROLES)('%s has a non-empty permission set', (role) => {
    expect(RolePermissions[role]).toBeDefined();
    expect(RolePermissions[role].length).toBeGreaterThan(0);
  });

  it.each(ALL_ROLES)('%s has a display name', (role) => {
    expect(RoleDisplayNames[role]).toBeTruthy();
  });

  it('gives every role a distinct display name', () => {
    const names = ALL_ROLES.map((r) => RoleDisplayNames[r]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('owner tier', () => {
  it('carries every admin permission', () => {
    for (const permission of RolePermissions.admin) {
      expect(RolePermissions.owner).toContain(permission);
    }
  });

  it('is the only role with finance permissions', () => {
    expect(RolePermissions.owner).toContain('finance:read');
    expect(RolePermissions.owner).toContain('finance:write');
    for (const role of ALL_ROLES) {
      if (role === 'owner') continue;
      expect(RolePermissions[role].some((p) => p.startsWith('finance:'))).toBe(false);
    }
  });

  it('resolves as a platform role, not a field role', () => {
    expect(isPlatformRole('owner')).toBe(true);
    const { role, fieldRole } = resolveRoles('owner', undefined);
    expect(role).toBe('owner');
    expect(fieldRole).toBeUndefined();
  });
});

describe('role predicates', () => {
  it('treats owner as admin-level but not the reverse', () => {
    expect(isAdminLevel('owner')).toBe(true);
    expect(isAdminLevel('admin')).toBe(true);
    expect(isOwner('owner')).toBe(true);
    expect(isOwner('admin')).toBe(false);
  });

  it('excludes operations and field roles from admin-level', () => {
    expect(isAdminLevel('operations')).toBe(false);
    expect(isAdminLevel('regional_manager')).toBe(false);
    expect(isAdminLevel(undefined)).toBe(false);
  });

  it('counts every platform role as management and no field role', () => {
    for (const role of Object.values(PlatformRoles)) {
      expect(isManagementRole(role)).toBe(true);
    }
    for (const role of Object.values(FieldRoles)) {
      expect(isManagementRole(role)).toBe(false);
    }
    expect(isManagementRole(undefined)).toBe(false);
  });

  // The Firestore recipient queries use where('role','in',[...]) and cannot call
  // isManagementRole. If the two drift, an owner silently stops receiving the
  // notifications every other back-office user gets.
  it('keeps MANAGEMENT_PLATFORM_ROLES in step with isManagementRole', () => {
    expect([...MANAGEMENT_PLATFORM_ROLES].sort()).toEqual(
      (Object.values(PlatformRoles) as PlatformRole[]).sort()
    );
  });
});
