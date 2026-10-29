import { adminDb } from '@/lib/firebase/admin';
import { FieldRole, IBO_FIELD_ROLES, isManagementRole, isRecruiter, PlatformRole, resolveRoles } from '@/types';

/** The caller of a recruiting route, resolved from their users doc. */
export interface RecruitingRequester {
  uid: string;
  role: PlatformRole | undefined;
  fieldRole: FieldRole | undefined;
  /** May invite and activate recruits: management, L1/L2 managers, IBO owners and recruiters. */
  canManage: boolean;
  /** Sees every invite rather than only the ones they created. */
  canViewAll: boolean;
  /**
   * May invite and activate at any field role (no role ceiling): management,
   * and the hidden recruiter grant (users/{uid}.recruiter, isRecruiter).
   */
  canHireAnyRole: boolean;
  name: string;
}

export async function getRecruitingRequester(userId: string): Promise<RecruitingRequester | null> {
  if (!adminDb) return null;
  const doc = await adminDb.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const { role, fieldRole } = resolveRoles(data?.role, data?.fieldRole);
  // The recruiter grant opens all of recruiting the way operations has it,
  // without changing the role anything else reads.
  const recruiter = isRecruiter(data);
  const canManage =
    isManagementRole(role) ||
    recruiter ||
    fieldRole === 'l1_manager' ||
    fieldRole === 'l2_manager' ||
    (fieldRole ? IBO_FIELD_ROLES.includes(fieldRole) : false);
  return {
    uid: userId,
    role,
    fieldRole,
    canManage,
    canViewAll: isManagementRole(role) || recruiter,
    canHireAnyRole: isManagementRole(role) || recruiter,
    name: data?.displayName || data?.email || '3C Manager',
  };
}
