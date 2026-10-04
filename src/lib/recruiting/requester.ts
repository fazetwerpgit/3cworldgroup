import { adminDb } from '@/lib/firebase/admin';
import { FieldRole, IBO_FIELD_ROLES, isManagementRole, PlatformRole, resolveRoles } from '@/types';

/** The caller of a recruiting route, resolved from their users doc. */
export interface RecruitingRequester {
  uid: string;
  role: PlatformRole | undefined;
  fieldRole: FieldRole | undefined;
  /** May invite and activate recruits: management, L1/L2 managers and IBO owners. */
  canManage: boolean;
  /** Sees every invite rather than only the ones they created. */
  canViewAll: boolean;
  name: string;
}

export async function getRecruitingRequester(userId: string): Promise<RecruitingRequester | null> {
  if (!adminDb) return null;
  const doc = await adminDb.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const { role, fieldRole } = resolveRoles(data?.role, data?.fieldRole);
  const canManage =
    isManagementRole(role) ||
    fieldRole === 'l1_manager' ||
    fieldRole === 'l2_manager' ||
    (fieldRole ? IBO_FIELD_ROLES.includes(fieldRole) : false);
  return {
    uid: userId,
    role,
    fieldRole,
    canManage,
    canViewAll: isManagementRole(role),
    name: data?.displayName || data?.email || '3C Manager',
  };
}
