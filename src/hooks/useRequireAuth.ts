'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { userSatisfiesRoles, type FieldRole, type GateRole, type PlatformRole } from '@/types';

interface UseRequireAuthOptions {
  requiredRoles?: GateRole[];
  requiredPermissions?: string[];
  redirectTo?: string;
  redirectIfFound?: string;
}

// The role check the redirect effect and isAuthorized() below share. It used to
// be written out twice, so a gate fixed in one copy stayed broken in the other.
// An owner satisfies any gate asking for 'admin': the tier sits above it, and
// every ProtectedRoute in the portal admits admin. A gate listing
// RECRUITER_GATE also admits the hidden recruiter grant (userSatisfiesRoles).
function satisfiesRoles(
  user: { role?: PlatformRole; fieldRole?: FieldRole; recruiter?: unknown },
  requiredRoles?: GateRole[]
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  return userSatisfiesRoles(user, requiredRoles);
}

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { user, loading, hasPermission, profileVerified } = useAuth();
  const router = useRouter();
  const {
    requiredRoles,
    requiredPermissions,
    redirectTo = '/portal',
    redirectIfFound,
  } = options;

  // Every hop here is a redirect, not a step: replace, so Back never lands on
  // a page that only bounces again (a protected page after sign-out, the
  // login after sign-in).
  useEffect(() => {
    if (loading) return;

    // If user is logged in and we should redirect them away (e.g., from login page)
    if (user && redirectIfFound) {
      router.replace(redirectIfFound);
      return;
    }

    // If no user and we need one, redirect to login
    if (!user) {
      router.replace(redirectTo);
      return;
    }

    // Role and permission redirects wait for the real profile read: the copy
    // this device remembered may be out of date (a role just changed), and
    // bouncing on it would send the rep to the wrong page.
    if (!profileVerified) return;

    // Check role requirements
    if (!satisfiesRoles(user, requiredRoles)) {
      router.replace('/portal/dashboard');
      return;
    }

    // Check permission requirements
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every((p) => hasPermission(p));
      if (!hasAllPermissions) {
        router.replace('/portal/dashboard');
        return;
      }
    }
  }, [
    user,
    loading,
    profileVerified,
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
