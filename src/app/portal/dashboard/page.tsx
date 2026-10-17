'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { RepDashboard } from '@/components/portal/rep/RepDashboard';
import s from '@/components/portal/rep/rep.module.css';

// Only the owners see the company view: it loads as its own chunk so every rep's
// dashboard does not download it (and the hiring/market code under it).
const OwnerDashboard = dynamic(
  () => import('@/components/portal/owner/OwnerDashboard').then((m) => m.OwnerDashboard),
  {
    ssr: false,
    loading: () => (
      <div aria-busy="true" aria-label="Loading">
        <span className={s.skel} style={{ display: 'block', height: 120, borderRadius: 14 }} />
      </div>
    ),
  }
);

// The owners don't sell, so their home is the company view. Everyone else —
// admins included — keeps their own rep dashboard. isRole('owner') is true for
// the owner role only (an admin never satisfies it).
export default function DashboardPage() {
  const { isRole } = useAuth();
  return isRole('owner') ? <OwnerDashboard /> : <RepDashboard />;
}
