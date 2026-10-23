// Pure selection logic of scripts/backfill-manager-area-doors.mjs (tested by
// scripts/backfill-manager-area-doors.test.ts). No Firebase imports.

// ---- Kept in step with src/types/auth.ts (resolveRoles, isAdminLevel, isManagementRole,
// ---- MANAGEMENT_FIELD_ROLES) and src/lib/auth/requireVerifiedAdmin.ts (requireVerifiedKnockCaller).
const PLATFORM_ROLES = ['admin', 'operations', 'owner'];
const FIELD_ROLES = [
  'entry_rep', 'entry_level_rep', 'l1_manager', 'l2_manager', 'ibo_level_1', 'ibo_level_2', 'ibo_level_3',
  'ibo_level_4', 'general_manager', 'gm_in_training', 'office_manager', 'ae_tier_1', 'ae_tier_2',
  'regional_manager', 'director', 'internal_rep',
];
const MANAGEMENT_FIELD_ROLES = [
  'l1_manager', 'l2_manager', 'ibo_level_1', 'ibo_level_2', 'ibo_level_3', 'ibo_level_4', 'general_manager',
  'office_manager', 'regional_manager', 'director',
];
const KNOCK_ROLES = ['owner', 'manager', 'rep'];

/**
 * The knock role the import gate gives a users/{uid} doc: admin/owner -> 'owner', operations or a
 * management field role -> 'manager', anyone else -> 'rep'.
 * @param {{ role?: unknown; fieldRole?: unknown } | null | undefined} user
 * @returns {'owner' | 'manager' | 'rep'}
 */
export function knockRoleOfUser(user) {
  const rawRole = typeof user?.role === 'string' ? user.role : undefined;
  const rawFieldRole = typeof user?.fieldRole === 'string' ? user.fieldRole : undefined;
  let fieldRole = rawFieldRole && FIELD_ROLES.includes(rawFieldRole) ? rawFieldRole : undefined;
  let role;
  if (rawRole && PLATFORM_ROLES.includes(rawRole)) role = rawRole;
  else if (rawRole && FIELD_ROLES.includes(rawRole)) fieldRole = fieldRole ?? rawRole;
  if (role === 'admin' || role === 'owner') return 'owner';
  if (role === 'operations' || (fieldRole && MANAGEMENT_FIELD_ROLES.includes(fieldRole))) return 'manager';
  return 'rep';
}

/**
 * The importer's knock role for an areaImports record: the stored `createdByRole` when there is
 * one (imports from this change on), else the user's current role; null when the record has no
 * importer or the user doc is gone.
 * @param {{ createdBy?: unknown; createdByRole?: unknown }} record
 * @param {{ role?: unknown; fieldRole?: unknown } | null | undefined} user users/{createdBy} data, or null
 * @returns {'owner' | 'manager' | 'rep' | null}
 */
export function importerRole(record, user) {
  if (typeof record.createdBy !== 'string' || record.createdBy === '') return null;
  if (typeof record.createdByRole === 'string' && KNOCK_ROLES.includes(record.createdByRole)) {
    return /** @type {'owner' | 'manager' | 'rep'} */ (record.createdByRole);
  }
  if (!user) return null;
  return knockRoleOfUser(user);
}

/**
 * What to do with one door of a manager's import: 'set' (managerId = importer) only when it belongs
 * to the import's campaign (or was soft-deleted from it: campaignId '_deleted' with
 * deleted.campaignId) and has neither a manager nor a rep. Otherwise the skip reason.
 * @param {Record<string, unknown>} door houses/{id} data
 * @param {string} campaignId the import's campaign
 * @param {string} importerUid
 * @returns {'set' | 'already-theirs' | 'has-manager' | 'assigned' | 'other-campaign'}
 */
export function doorAction(door, campaignId, importerUid) {
  const deleted = door.deleted && typeof door.deleted === 'object' ? /** @type {{ campaignId?: unknown }} */ (door.deleted) : null;
  const inCampaign = door.campaignId === campaignId || (door.campaignId === '_deleted' && deleted?.campaignId === campaignId);
  if (!inCampaign) return 'other-campaign';
  const managerId = door.managerId ?? null;
  if (managerId === importerUid) return 'already-theirs';
  if (managerId !== null) return 'has-manager';
  if ((door.assignedRepId ?? null) !== null) return 'assigned';
  return 'set';
}
