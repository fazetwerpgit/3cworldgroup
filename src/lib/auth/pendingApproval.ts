import { FieldRole } from '@/types';

export function isAwaitingRoleAssignment(userData: {
  status?: string;
  fieldRole?: FieldRole;
}): boolean {
  return userData.status === 'pending' && !userData.fieldRole;
}
