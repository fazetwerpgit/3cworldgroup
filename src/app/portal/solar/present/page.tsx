'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SolarNoAccess, SolarPresenter } from '@/components/portal/solar/SolarPresenter';
import { useAuth } from '@/contexts/AuthContext';
import { canSeeSolar } from '@/lib/solar/access';

// /portal/solar/present: the solar pitch deck, full screen, for reps with a
// solarRole (and admins). Outside the rep shell on purpose: it is handed to
// the homeowner, so no portal chrome.

function Gate() {
  const { user } = useAuth();
  return canSeeSolar(user) ? <SolarPresenter /> : <SolarNoAccess />;
}

export default function SolarPresentPage() {
  return (
    <ProtectedRoute>
      <Gate />
    </ProtectedRoute>
  );
}
