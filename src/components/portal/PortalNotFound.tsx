'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { RepShell } from '@/components/portal/rep/RepShell';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sale.module.css';

/**
 * The portal's not-found page: the rep shell (top bar, tab bar, safe areas)
 * around the same panel as "Sale not found", with the way back to the
 * dashboard. Signed out, the shell's gate sends the person to sign in.
 */
export default function PortalNotFound() {
  return (
    <RepShell task="Not found">
      <div className={x.page}>
        <section className={`${s.panel} ${x.empty}`}>
          <TriangleAlert size={28} aria-hidden="true" color="var(--c-amber)" />
          <h1>Page not found</h1>
          <p>This portal page doesn&apos;t exist. The link may be old or mistyped.</p>
          <Link href="/portal/dashboard" className={s.btnPrimary}>
            Go to dashboard
          </Link>
        </section>
      </div>
    </RepShell>
  );
}
