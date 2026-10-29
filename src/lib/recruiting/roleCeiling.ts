import {
  FieldRole,
  INVITABLE_FIELD_ROLES,
  isManagementRole,
  MANAGEMENT_FIELD_ROLES,
  PlatformRole,
} from '@/types/auth';

/**
 * The field roles an inviter may hire at. Management (admin, owner,
 * operations) may use every invitable role. A field manager (L1/L2 or IBO)
 * may only hire below management: the manager-tier roles (regional manager,
 * director) sit above their own, so management invites and activates those.
 * The hidden recruiter grant (`recruiter: true`) hires like management, as the
 * server does (requester.canHireAnyRole).
 */
export function invitableFieldRolesFor(
  inviterRole: PlatformRole | FieldRole | undefined,
  options: { recruiter?: boolean } = {}
): readonly FieldRole[] {
  if (isManagementRole(inviterRole) || options.recruiter === true) return INVITABLE_FIELD_ROLES;
  return INVITABLE_FIELD_ROLES.filter((role) => !MANAGEMENT_FIELD_ROLES.includes(role));
}

/** May this inviter hire (invite or activate) someone at this field role? */
export function canHireAtFieldRole(
  inviterRole: PlatformRole | FieldRole | undefined,
  fieldRole: unknown
): boolean {
  if (isManagementRole(inviterRole)) return true;
  if (typeof fieldRole !== 'string') return false;
  return !MANAGEMENT_FIELD_ROLES.includes(fieldRole as FieldRole);
}
