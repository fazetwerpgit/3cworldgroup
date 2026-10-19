'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sun } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RepShell } from '@/components/portal/rep/RepShell';
import { SOLAR_DECK_HREF, SolarEntryCard } from '@/components/portal/rep/SolarEntryCard';
import { SolarLeadSheet, SolarMyLeads, SolarNextConsult, useMyLeads } from '@/components/portal/solar/SolarMyLeads';
import r from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import css from './solar-page.module.css';

// /portal/solar: the rep's Solar page on the rep shell (the nav's Solar item;
// the deck's Exit comes back here). Open deck sits in the head, first thing a
// new rep sees; the deck's cover leads the body, beside it (under it on a
// phone) the next consultation and My leads, the rep's own homeowners with
// status and consult time, each opening its details read only. The deck
// itself, /portal/solar/present, stays chrome-free (repShellRoutes BARE_PATHS).
function SolarPageBody() {
  const { hasPermission } = useAuth();
  const { leads, failed, retry } = useMyLeads();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (leads?.find((lead) => lead.id === openId) ?? null) : null;

  return (
    <div className={p.page}>
      <header className={p.head}>
        <h1 className={p.title}>Solar</h1>
        {hasPermission('solar:write') ? (
          <Link href={SOLAR_DECK_HREF} className={`${r.btnPrimary} ${css.openDeck}`}>
            <Sun size={20} strokeWidth={2.5} aria-hidden="true" />
            Open deck
          </Link>
        ) : null}
      </header>
      <div className={css.grid}>
        <SolarEntryCard variant="lead" action={false} />
        <div className={css.side}>
          <SolarNextConsult leads={leads} onOpen={setOpenId} />
          <SolarMyLeads leads={leads} failed={failed} onRetry={retry} onOpen={setOpenId} />
        </div>
      </div>
      {open ? <SolarLeadSheet lead={open} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

export default function SolarPage() {
  return (
    <RepShell permissions={['solar:read']}>
      <SolarPageBody />
    </RepShell>
  );
}
