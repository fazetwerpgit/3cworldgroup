'use client';

import Link from 'next/link';
import { AdminGate, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import { PEOPLE_HUB } from '@/components/portal/admin-d/adminHubs';
import { CompPlanMatrix } from '@/components/resources/CompPlanMatrix';
import s from '@/components/portal/rep/rep.module.css';
import l from '@/components/portal/rep/rep-learn.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';

// The owner's comp plan editor, the same one at the foot of Learn > Pay & links,
// so pay can be found where the rest of the back office lives. The comp plan
// API is owner-only for writes.
export function PayRates() {
  return (
    <AdminGate roles={['owner']}>
      <div className={u.page}>
        <AdminPageHead
          title="Pay rates"
          sub={
            <>
              What each role is paid per install. A rep is paid from their role&apos;s column, so to change one
              rep&apos;s pay, change their role in <Link href={PEOPLE_HUB.href}>People</Link>.
            </>
          }
        />
        <div className={`${s.panel} ${l.matrix}`}>
          <CompPlanMatrix />
        </div>
      </div>
    </AdminGate>
  );
}
