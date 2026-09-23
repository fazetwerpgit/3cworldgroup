'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { PendingApproval } from '@/components/auth/PendingApproval';
import { RepBoot } from '@/components/portal/rep/RepShell';

export default function PortalLoginPage() {
  const { user, loading, pendingApproval } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (!loading && user) {
      router.push('/portal/dashboard');
    }
  }, [user, loading, router]);

  // Checking auth state: the same D boot mark the signed-in shell shows, so
  // there is no flash between this and the login or the dashboard.
  if (loading) return <RepBoot />;

  // If user is logged in, show nothing (will redirect)
  if (user) {
    return null;
  }

  if (pendingApproval) {
    return <PendingApproval />;
  }

  // Show login form
  return <LoginForm />;
}
