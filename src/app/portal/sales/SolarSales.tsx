'use client';

import { useState, type ReactNode } from 'react';
import { SolarLeadSheet, SolarMyLeads, SolarNextConsult, useMyLeads } from '@/components/portal/solar/SolarMyLeads';
import { MyAvailabilityRow } from '@/components/portal/solar/MyAvailabilityRow';
import x from '@/components/portal/rep/rep-sales.module.css';
import css from './solar-sales.module.css';

/**
 * The Sales tab's solar side: the next consultation, then My leads (the rep's
 * own homeowners), each opening its details read only. Someone who takes
 * consultations also gets a row into My availability, under the head. A solar-only rep's
 * whole Sales tab; a dual rep's Solar side of the Fiber | Solar switch. `head`
 * is the page's own header (the title, and a dual rep's switch).
 */
export function SolarSales({ head }: { head: ReactNode }) {
  const { leads, failed, retry } = useMyLeads();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (leads?.find((lead) => lead.id === openId) ?? null) : null;

  return (
    <div className={x.page}>
      {head}
      <MyAvailabilityRow />
      <div className={css.solar}>
        <SolarNextConsult leads={leads} onOpen={setOpenId} />
        <SolarMyLeads leads={leads} failed={failed} onRetry={retry} onOpen={setOpenId} />
      </div>
      {open ? <SolarLeadSheet lead={open} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
