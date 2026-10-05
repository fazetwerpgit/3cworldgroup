import type { Metadata } from 'next';

// Invite links carry a private token: keep them out of search results.
export const metadata: Metadata = {
  title: 'Onboarding | 3C World Group',
  robots: { index: false, follow: false },
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
