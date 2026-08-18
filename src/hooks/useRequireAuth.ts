'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isOwner, UserRole, type FieldRole, type PlatformRole } from '@/types';

interface UseRequireAuthOptions {
  requiredRoles?: UserRole[];
  requiredPermissions?: string[];
  redirectTo?: string;
  redirectIfFound?: string;
}

// The role check the redirect effect and isAuthorized() below share. It used to
// be written out twice, so a gate fixed in one copy stayed broken in the other.
// An owner satisfies any gate asking for 'admin': the tier sits above it, and
// every ProtectedRoute in the portal admits admin.
function satisfiesRoles(
  user: { role?: PlatformRole; fieldRole?: FieldRole },
  requiredRoles?: UserRole[]
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  const roleKey = user.role ?? user.fieldRole;
  if (!roleKey) return false;
  if (requiredRoles.includes(roleKey)) return true;
  return isOwner(roleKey) && requiredRoles.includes('admin');
}

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { user, loading, hasPermission } = useAuth();
  const router = useRouter();
  const {
    requiredRoles,
    requiredPermissions,
    redirectTo = '/portal',
    redirectIfFound,
  } = options;

  useEffect(() => {
    if (loading) return;

    // If user is logged in and we should redirect them away (e.g., from login page)
    if (user && redirectIfFound) {
      router.push(redirectIfFound);
      return;
    }

    // If no user and we need one, redirect to login
    if (!user) {
      router.push(redirectTo);
      return;
    }

    // Check role requirements
    if (!satisfiesRoles(user, requiredRoles)) {
      router.push('/portal/dashboard');
      return;
    }

    // Check permission requirements
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every((p) => hasPermission(p));
      if (!hasAllPermissions) {
        router.push('/portal/dashboard');
        return;
      }
    }
  }, [
    user,
    loading,
    router,
    requiredRoles,
    requiredPermissions,
    redirectTo,
    redirectIfFound,
    hasPermission,
  ]);

  const isAuthorized = (): boolean => {
    if (!user) return false;

    if (!satisfiesRoles(user, requiredRoles)) return false;

    if (requiredPermissions && requiredPermissions.length > 0) {
      if (!requiredPermissions.every((p) => hasPermission(p))) return false;
    }

    return true;
  };

  return {
    user,
    loading,
    isAuthorized: isAuthorized(),
  };
}
