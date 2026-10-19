'use client';

import { RepShell } from '@/components/portal/rep/RepShell';
import { SolarEntryCard } from '@/components/portal/rep/SolarEntryCard';
import p from '@/components/portal/rep/rep-page.module.css';
import css from './solar-page.module.css';

// /portal/solar: the rep's Solar page on the rep shell (the nav's Solar item;
// the deck's Exit comes back here). The deck itself, /portal/solar/present,
// stays chrome-free (repShellRoutes BARE_PATHS). My leads and the next
// consultation land here next (docs/solar/IA_PLAN.md, package B).
export default function SolarPage() {
  return (
    <RepShell permissions={['solar:read']}>
      <div className={p.page}>
        <header className={p.head}>
          <h1 className={p.title}>Solar</h1>
        </header>
        <div className={css.deck}>
          <SolarEntryCard variant="lead" />
        </div>
      </div>
    </RepShell>
  );
}
