'use client';

import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { SOLAR_HUB } from '@/components/portal/admin-d/adminHubs';
import SolarLeads from './SolarLeads';
import SolarSetup from './SolarSetup';

// Admin Solar: the leads reps save from the deck (?tab=leads) and the
// consultation setup (?tab=setup), both admin only (the owner passes).
export default function SolarAdminPage() {
  return (
    <AdminHub
      hub={SOLAR_HUB}
      title="Solar"
      panels={{
        leads: () => <SolarLeads />,
        setup: () => <SolarSetup />,
      }}
    />
  );
}
