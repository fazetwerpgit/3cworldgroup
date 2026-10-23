import { describe, expect, it } from 'vitest';
import { FieldRoles, MANAGEMENT_FIELD_ROLES, PlatformRoles, isAdminLevel, isManagementRole } from '@/types/auth';
import { doorAction, importerRole, knockRoleOfUser } from './backfill-manager-area-doors.lib.mjs';

describe('knockRoleOfUser (mirrors requireVerifiedKnockCaller)', () => {
  it.each([
    [{ role: 'owner' }, 'owner'],
    [{ role: 'admin', fieldRole: 'general_manager' }, 'owner'],
    [{ role: 'operations' }, 'manager'],
    [{ fieldRole: 'general_manager' }, 'manager'],
    [{ role: 'regional_manager' }, 'manager'],
    [{ fieldRole: 'ae_tier_1' }, 'rep'],
    [{ fieldRole: 'gm_in_training' }, 'rep'],
    [{}, 'rep'],
  ])('%o -> %s', (user, role) => {
    expect(knockRoleOfUser(user)).toBe(role);
  });
});

describe('knockRoleOfUser stays in step with src/types/auth.ts', () => {
  it('agrees with the gate for every platform and field role', () => {
    for (const role of Object.values(PlatformRoles)) {
      expect(knockRoleOfUser({ role })).toBe(isAdminLevel(role) ? 'owner' : isManagementRole(role) ? 'manager' : 'rep');
    }
    for (const fieldRole of Object.values(FieldRoles)) {
      expect(knockRoleOfUser({ fieldRole })).toBe(MANAGEMENT_FIELD_ROLES.includes(fieldRole) ? 'manager' : 'rep');
    }
  });
});

describe('importerRole', () => {
  it('uses the stored createdByRole over the current role', () => {
    expect(importerRole({ createdBy: 'u', createdByRole: 'manager' }, { role: 'owner' })).toBe('manager');
    expect(importerRole({ createdBy: 'u', createdByRole: 'owner' }, { fieldRole: 'director' })).toBe('owner');
  });
  it('falls back to the user doc, null when there is no importer or user', () => {
    expect(importerRole({ createdBy: 'u' }, { fieldRole: 'director' })).toBe('manager');
    expect(importerRole({ createdBy: 'u' }, null)).toBeNull();
    expect(importerRole({}, { role: 'owner' })).toBeNull();
  });
});

describe('doorAction', () => {
  const base = { campaignId: 'solar', managerId: null, assignedRepId: null };
  it('sets an unassigned door with no manager, live or soft-deleted from the campaign', () => {
    expect(doorAction(base, 'solar', 'mgr')).toBe('set');
    expect(doorAction({ campaignId: 'solar' }, 'solar', 'mgr')).toBe('set');
    expect(doorAction({ ...base, campaignId: '_deleted', deleted: { by: 'x', at: 1, campaignId: 'solar' } }, 'solar', 'mgr')).toBe('set');
  });
  it('skips everything else', () => {
    expect(doorAction({ ...base, managerId: 'mgr' }, 'solar', 'mgr')).toBe('already-theirs');
    expect(doorAction({ ...base, managerId: 'other' }, 'solar', 'mgr')).toBe('has-manager');
    expect(doorAction({ ...base, assignedRepId: 'rep' }, 'solar', 'mgr')).toBe('assigned');
    expect(doorAction({ ...base, campaignId: 'fiber' }, 'solar', 'mgr')).toBe('other-campaign');
    expect(doorAction({ ...base, campaignId: '_deleted', deleted: { campaignId: 'fiber' } }, 'solar', 'mgr')).toBe('other-campaign');
    expect(doorAction({ ...base, campaignId: '_deleted' }, 'solar', 'mgr')).toBe('other-campaign');
  });
});
