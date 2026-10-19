'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SolarNoAccess, SolarPresenter } from '@/components/portal/solar/SolarPresenter';
import { useAuth } from '@/contexts/AuthContext';

// /portal/solar/present: the solar pitch deck, full screen, for whoever holds
// solar:write (a solar role, or admin/owner). Outside the rep shell on purpose: it is handed to
// the homeowner, so no portal chrome.

function Gate() {
  const { hasPermission } = useAuth();
  return hasPermission('solar:write') ? <SolarPresenter /> : <SolarNoAccess />;
}

export default function SolarPresentPage() {
  return (
    <ProtectedRoute>
      <Gate />
    </ProtectedRoute>
  );
}
