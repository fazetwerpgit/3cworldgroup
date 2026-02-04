'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';

interface UseRequireAuthOptions {
  requiredRoles?: UserRole[];
  requiredPermissions?: string[];
  redirectTo?: string;
  redirectIfFound?: string;
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
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        router.push('/portal/dashboard');
        return;
      }
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

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) return false;
    }

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
