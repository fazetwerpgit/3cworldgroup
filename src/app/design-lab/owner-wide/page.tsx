'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { OwnerDashboard } from '@/components/portal/owner/OwnerDashboard';
import s from '@/components/portal/rep/rep.module.css';

// Temporary harness (untracked, never committed): owner dashboard in the rep
// shell frame; /api/portal/owner/summary is stubbed by the capture script.
export default function Page() {
  return (
    <AuthProvider>
    <div className={s.root} data-shell="rep">
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <b>3C WORLD GROUP</b>
          <button type="button" className={s.btnPrimary} style={{ marginLeft: 'auto', minHeight: 40 }}>
            Log sale
          </button>
        </div>
      </header>
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <OwnerDashboard />
        </div>
      </main>
    </div>
    </AuthProvider>
  );
}
