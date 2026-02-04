'use client';

import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermissions?: string[];
  fallback?: React.ReactNode;
}

/**
 * RoleGate - Conditionally renders children based on user role or permissions
 * Use this for hiding UI elements, not for protecting routes (use ProtectedRoute for that)
 */
export function RoleGate({
  children,
  allowedRoles,
  requiredPermissions,
  fallback = null,
}: RoleGateProps) {
  const { user, hasPermission, isRole } = useAuth();

  if (!user) return <>{fallback}</>;

  // Check role requirements
  if (allowedRoles && allowedRoles.length > 0) {
    if (!isRole(...allowedRoles)) return <>{fallback}</>;
  }

  // Check permission requirements
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAll = requiredPermissions.every((p) => hasPermission(p));
    if (!hasAll) return <>{fallback}</>;
  }

  return <>{children}</>;
}
