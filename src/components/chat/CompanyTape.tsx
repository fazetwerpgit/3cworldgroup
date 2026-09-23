'use client';

import { useEffect, useState } from 'react';
import { relativeSaleTime, tapeRepName } from '@/lib/sales/companyTape';
import type { CompanyStats } from './chatFormat';
import c from './chat.module.css';

// Ticks every minute, and at once when the app comes back to the foreground
// (timers are frozen while an installed app is in the background).
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', tick);
    };
  }, []);
  return now;
}

/**
 * All Company tape: "Company · 42 sales this month · Top: Braeden 9 · Last:
 * Cole · 12m ago". Always one line; it scrolls sideways instead of wrapping.
 */
export function CompanyTape({ stats }: { stats: CompanyStats }) {
  const now = useMinuteClock();
  const lastAt = stats.lastSale?.at ? Date.parse(stats.lastSale.at) : NaN;

  return (
    <p className={c.tape}>
      <span className={c.tapeLabel}>Company</span>
      <span aria-hidden="true">·</span>
      <span>
        <strong>{stats.mtdCount}</strong> sale{stats.mtdCount === 1 ? '' : 's'} this month
      </span>
      {stats.topRep && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            Top: <strong>{tapeRepName(stats.topRep.repName)}</strong> {stats.topRep.count}
          </span>
        </>
      )}
      {stats.lastSale && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            Last: <strong>{tapeRepName(stats.lastSale.repName)}</strong>
          </span>
          {Number.isFinite(lastAt) && (
            <>
              <span aria-hidden="true">·</span>
              <span>{relativeSaleTime(lastAt, now)}</span>
            </>
          )}
        </>
      )}
    </p>
  );
}
