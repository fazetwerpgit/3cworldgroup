'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getIdToken } from '@/lib/firebase/getIdToken';
import {
  CALLOUT_HOME_WHY,
  calloutHomeLine,
  calloutLogLink,
  type CalloutStatus,
} from '@/lib/sales/calloutNudge';
import { installDayKey } from '@/lib/sales/saleDate';
import s from './rep.module.css';
import c from './callout-nudge.module.css';

/**
 * Sales called out in All Company today that are not logged yet: one quiet
 * line at the top of Home, with the reason logging matters and a way to log.
 * Nothing when the rep is caught up, nothing once the Chicago day it counted
 * is over, nothing when the count could not load (it is a reminder, not a
 * figure anyone relies on).
 */
export function CalloutNudgeLine({ status, now }: { status: CalloutStatus | null; now: Date }) {
  if (!status || status.gap <= 0 || status.day !== installDayKey(now)) return null;
  return (
    <aside className={c.nudge} aria-label="Sales to log">
      <div className={c.body}>
        <p className={c.line}>{calloutHomeLine(status.callouts, status.logged)}</p>
        <p className={c.why}>{CALLOUT_HOME_WHY}</p>
      </div>
      <Link href={calloutLogLink(status.gap)} className={`${s.btnSecondary} ${c.log}`}>
        Log sale
      </Link>
    </aside>
  );
}

/**
 * Reads the count from GET /api/portal/sales/callouts (counted server-side, so
 * no new read rules) on mount and whenever the app comes back to the
 * foreground: logging the sale and coming back home clears it.
 */
export function CalloutNudge({ now }: { now: Date }) {
  const [status, setStatus] = useState<CalloutStatus | null>(null);
  const [check, setCheck] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setCheck((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await getIdToken();
        const response = await fetch('/api/portal/sales/callouts', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });
        if (!response.ok) return;
        setStatus((await response.json()) as CalloutStatus);
      } catch {
        // Offline or aborted: the line simply does not show.
      }
    })();
    return () => controller.abort();
  }, [check]);

  return <CalloutNudgeLine status={status} now={now} />;
}
