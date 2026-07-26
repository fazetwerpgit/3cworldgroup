'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isOnboardingAllowedPage, isOnboardingUser } from '@/lib/auth/onboardingAccess';

// Confines a hire who has not finished onboarding to their checklist plus the
// welcome set the client chose (chat, training, resources, calls, settings).
// The server enforces the same list independently via onboardingAccess.ts — this
// exists so a hire sees their checklist instead of a redirect loop, not as the
// security boundary.
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const blocked = !loading && isOnboardingUser(user) && !isOnboardingAllowedPage(pathname);

  useEffect(() => {
    if (blocked) router.replace('/portal/onboarding');
  }, [blocked, router]);

  // Render nothing on the frame we are redirecting away from, so a blocked page
  // never paints. While auth is still loading, render normally — a premature
  // redirect would bounce an admin on a hard refresh.
  if (blocked) return null;

  return <>{children}</>;
}
