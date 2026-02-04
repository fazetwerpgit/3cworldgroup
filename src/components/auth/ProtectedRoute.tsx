'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: UserRole[];
  permissions?: string[];
  fallback?: React.ReactNode;
}

export function ProtectedRoute({
  children,
  roles,
  permissions,
  fallback,
}: ProtectedRouteProps) {
  const { loading, isAuthorized } = useRequireAuth({
    requiredRoles: roles,
    requiredPermissions: permissions,
  });

  if (loading) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8dc63f] mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      )
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
