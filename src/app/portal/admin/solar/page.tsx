'use client';

import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { SOLAR_HUB } from '@/components/portal/admin-d/adminHubs';
import { useHubTabCounts } from '@/components/portal/admin-d/opsQueues';
import SolarLeads from './SolarLeads';
import SolarSetup from './SolarSetup';

// Admin Solar: the leads reps save from the deck (?tab=leads) and the
// consultation setup (?tab=setup), both admin only (the owner passes).
export default function SolarAdminPage() {
  // New leads (saved, not booked yet) beside the Leads tab: the nav badge's figure.
  const counts = useHubTabCounts(SOLAR_HUB);
  return (
    <AdminHub
      hub={SOLAR_HUB}
      title="Solar"
      counts={counts}
      panels={{
        leads: () => <SolarLeads />,
        setup: () => <SolarSetup />,
      }}
    />
  );
}
