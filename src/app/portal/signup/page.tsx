'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push('/portal/dashboard');
  }, [user, loading, router]);

  if (user) return null;
  return <SignupForm />;
}
