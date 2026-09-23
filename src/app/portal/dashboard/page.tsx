'use client';

import { useAuth } from '@/contexts/AuthContext';
import { OwnerDashboard } from '@/components/portal/owner/OwnerDashboard';
import { RepDashboard } from '@/components/portal/rep/RepDashboard';

// The owners don't sell, so their home is the company view. Everyone else —
// admins included — keeps their own rep dashboard. isRole('owner') is true for
// the owner role only (an admin never satisfies it).
export default function DashboardPage() {
  const { isRole } = useAuth();
  return isRole('owner') ? <OwnerDashboard /> : <RepDashboard />;
}
