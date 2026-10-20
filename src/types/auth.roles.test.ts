import { describe, it, expect } from 'vitest';
import {
  ADMIN_LEVEL_PLATFORM_ROLES,
  FieldRoles,
  isAdminLevel,
  isManagementRole,
  isOwner,
  isPlatformRole,
  MANAGEMENT_PLATFORM_ROLES,
  PlatformRoles,
  resolveRoles,
  RoleDisplayNames,
  repFacingRoleLabel,
  RolePermissions,
  permissionsFor,
  isSolarOnlyUser,
  isDualRoleUser,
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

  // Same drift guard for the admin-level twin (sale-review fan-outs).
  it('keeps ADMIN_LEVEL_PLATFORM_ROLES in step with isAdminLevel', () => {
    const adminLevel = (Object.values(PlatformRoles) as PlatformRole[]).filter((role) =>
      isAdminLevel(role)
    );
    expect([...ADMIN_LEVEL_PLATFORM_ROLES].sort()).toEqual(adminLevel.sort());
  });

  // Operations sees only their OWN sales. sales:read:all is the "sees the whole
  // book" switch (it took that job over from sales:approve when approval was
  // removed), so operations must never carry it.
  it('denies sales:read:all to operations but keeps it for admin and owner', () => {
    expect(RolePermissions.operations).not.toContain('sales:read:all');
    expect(RolePermissions.admin).toContain('sales:read:all');
    expect(RolePermissions.owner).toContain('sales:read:all');
  });

  it('grants sale approval to nobody — the feature is gone', () => {
    for (const permissions of Object.values(RolePermissions)) {
      expect(permissions).not.toContain('sales:approve');
    }
  });
});

describe('repFacingRoleLabel', () => {
  it('never names an IBO role', () => {
    for (const role of ['ibo_level_1', 'ibo_level_2', 'ibo_level_3', 'ibo_level_4'] as const) {
      expect(repFacingRoleLabel(role)).toBeNull();
    }
  });

  it('names every other role as RoleDisplayNames does', () => {
    expect(repFacingRoleLabel('entry_rep')).toBe(RoleDisplayNames.entry_rep);
    expect(repFacingRoleLabel('l1_manager')).toBe('L1 Manager');
    expect(repFacingRoleLabel('admin')).toBe('Administrator');
  });

  it('returns null when there is no role', () => {
    expect(repFacingRoleLabel(undefined)).toBeNull();
    expect(repFacingRoleLabel(null)).toBeNull();
  });
});

// Solar is a second axis beside the platform/field role: permissionsFor adds a
// solar role's permissions to the role's own. Admin and owner hold solar
// through ADMIN_PERMISSIONS; operations and fiber-only reps never do.
describe('permissionsFor (solar)', () => {
  it('gives any solar role solar:read and solar:write, alone or beside a fiber role', () => {
    const solarOnly = permissionsFor({ solarRole: 'entry_canvasser' });
    expect(solarOnly).toEqual(expect.arrayContaining(['solar:read', 'solar:write']));
    // The base rep set (chat, board, training) rides along; never fiber sales or admin.
    expect(solarOnly).toEqual(expect.arrayContaining(['chat:read', 'chat:write', 'leaderboard:read', 'training:read']));
    expect(solarOnly.some((p) => p.startsWith('sales:') || p.startsWith('admin') || p.startsWith('pay'))).toBe(false);
    const dual = permissionsFor({ fieldRole: 'ae_tier_1', solarRole: 'sales_director' });
    expect(dual).toEqual(expect.arrayContaining([...RolePermissions.ae_tier_1, 'solar:read', 'solar:write']));
    expect(new Set(dual).size).toBe(dual.length);
  });

  it('opens solar to admin and owner without a solar role', () => {
    for (const role of ['admin', 'owner'] as const) {
      expect(permissionsFor({ role })).toEqual(expect.arrayContaining(['solar:read', 'solar:write']));
      expect(permissionsFor({ role, solarRole: null })).toEqual(RolePermissions[role]);
    }
  });

  it('denies solar to operations, fiber-only reps, unknown solar roles and nobody', () => {
    expect(permissionsFor({ role: 'operations' })).not.toContain('solar:read');
    expect(permissionsFor({ fieldRole: 'entry_rep', solarRole: null })).toEqual(RolePermissions.entry_rep);
    expect(permissionsFor({ fieldRole: 'entry_rep', solarRole: 'bogus' })).not.toContain('solar:write');
    expect(permissionsFor({})).toEqual([]);
    expect(permissionsFor(null)).toEqual([]);
  });

  it('isSolarOnlyUser: a solar role with no fiber or platform role', () => {
    expect(isSolarOnlyUser({ solarRole: 'virtual_closer' })).toBe(true);
    expect(isSolarOnlyUser({ solarRole: 'virtual_closer', fieldRole: 'entry_rep' })).toBe(false);
    expect(isSolarOnlyUser({ solarRole: 'virtual_closer', role: 'admin' })).toBe(false);
    expect(isSolarOnlyUser({ fieldRole: 'entry_rep' })).toBe(false);
    expect(isSolarOnlyUser({ solarRole: 'bogus' })).toBe(false);
    expect(isSolarOnlyUser(null)).toBe(false);
  });

  it('isDualRoleUser: both / fiber-only / solar-only', () => {
    const both = { solarRole: 'virtual_closer', fieldRole: 'entry_rep' } as const;
    const fiberOnly = { fieldRole: 'entry_rep' } as const;
    const solarOnly = { solarRole: 'virtual_closer' } as const;
    expect([both, fiberOnly, solarOnly].map((u) => [isDualRoleUser(u), isSolarOnlyUser(u)])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    expect(isDualRoleUser({ solarRole: 'virtual_closer', role: 'admin' })).toBe(true);
    expect(isDualRoleUser({ solarRole: 'bogus', fieldRole: 'entry_rep' })).toBe(false);
    expect(isDualRoleUser({ solarRole: null, fieldRole: 'entry_rep' })).toBe(false);
    expect(isDualRoleUser(null)).toBe(false);
  });

  it('keeps solar off every field role', () => {
    for (const role of Object.values(FieldRoles) as FieldRole[]) {
      expect(RolePermissions[role].some((p) => p.startsWith('solar:'))).toBe(false);
    }
  });
});
