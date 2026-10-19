import { isAdminLevel, isSolarRole, type FieldRole, type PlatformRole } from '@/types/auth';

/**
 * Solar visibility: a user sees the solar deck/API when they carry a solarRole
 * or are admin level (admin/owner). Fiber reps without a solarRole see nothing.
 * Pure: works on the client User and on a raw Firestore users doc.
 */
export function canSeeSolar(
  user: { role?: PlatformRole | FieldRole | string | null; solarRole?: unknown } | null | undefined
): boolean {
  if (!user) return false;
  if (isSolarRole(user.solarRole)) return true;
  return isAdminLevel((user.role ?? undefined) as PlatformRole | undefined);
}
