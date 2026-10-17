'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SignupForm } from '@/components/auth/SignupForm';
import { RepBoot } from '@/components/portal/rep/RepBoot';

export default function SignupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Replace: Back from the dashboard never returns to sign up.
    if (!loading && user) router.replace('/portal/dashboard');
  }, [user, loading, router]);

  if (user) return <RepBoot />;
  return <SignupForm />;
}
