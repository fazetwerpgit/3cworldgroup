'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { PendingApproval } from '@/components/auth/PendingApproval';
import { RepBoot } from '@/components/portal/rep/RepBoot';
import { useAppReady } from '@/lib/app/shellExtras';

export default function PortalLoginPage() {
  const { user, loading, pendingApproval } = useAuth();
  const router = useRouter();
  // Set once the first auth check settles. A later sign-in attempt also sets
  // `loading`, and swapping the form for the boot mark then would unmount it
  // and wipe the typed email when the password turns out wrong.
  const [authChecked, setAuthChecked] = useState(false);
  if (!loading && !authChecked) setAuthChecked(true);
  // App splash: the login form (or pending-approval screen) is the first real screen.
  useAppReady(authChecked && !user);

  useEffect(() => {
    // Signed in: on to the dashboard. Replace, so Back from the dashboard
    // leaves the portal instead of returning to the sign-in screen.
    if (!loading && user) {
      router.replace('/portal/dashboard');
    }
  }, [user, loading, router]);

  // Checking auth state: the same D boot mark the signed-in shell shows, so
  // there is no flash between this and the login or the dashboard.
  if (loading && !authChecked) return <RepBoot />;

  // Signed in: the boot mark holds the screen until the dashboard paints.
  if (user) {
    return <RepBoot />;
  }

  if (pendingApproval) {
    return <PendingApproval />;
  }

  // Show login form
  return <LoginForm />;
}
