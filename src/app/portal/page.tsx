'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';

export default function PortalLoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (!loading && user) {
      router.push('/portal/dashboard');
    }
  }, [user, loading, router]);

  // Show loading while checking auth state — same navy deck as the login so
  // there is no background flash between the two states.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A1F44]">
        <div className="flex items-center gap-3 text-white/70">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8dc63f]" />
          <p className="text-sm">Signing you in…</p>
        </div>
      </div>
    );
  }

  // If user is logged in, show nothing (will redirect)
  if (user) {
    return null;
  }

  // Show login form
  return <LoginForm />;
}
