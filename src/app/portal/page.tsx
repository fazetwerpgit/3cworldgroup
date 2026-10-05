'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { PendingApproval } from '@/components/auth/PendingApproval';
import { RepBoot } from '@/components/portal/rep/RepBoot';

export default function PortalLoginPage() {
  const { user, loading, pendingApproval } = useAuth();
  const router = useRouter();
  // Set once the first auth check settles. A later sign-in attempt also sets
  // `loading`, and swapping the form for the boot mark then would unmount it
  // and wipe the typed email when the password turns out wrong.
  const [authChecked, setAuthChecked] = useState(false);
  if (!loading && !authChecked) setAuthChecked(true);

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (!loading && user) {
      router.push('/portal/dashboard');
    }
  }, [user, loading, router]);

  // Checking auth state: the same D boot mark the signed-in shell shows, so
  // there is no flash between this and the login or the dashboard.
  if (loading && !authChecked) return <RepBoot />;

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
