'use client';

import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { googleStatusOf } from '@/lib/solar/google/status';
import rep from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import { useMyConsultant } from './useMyConsultant';
import css from './my-availability-row.module.css';

export const MY_AVAILABILITY_HREF = '/portal/solar/availability';

/**
 * The way into My availability from the Sales tab's solar side. Shown only to
 * someone who takes consultations (they have a consultant card); nothing for
 * everyone else, and nothing while it loads or if the check fails. The line
 * under it says what still needs doing: a calendar to connect or reconnect.
 */
export function MyAvailabilityRow() {
  const { mine } = useMyConsultant();
  if (mine.state !== 'ready') return null;
  const google = googleStatusOf(mine.consultant.googleCalendar);
  const sub = google?.connected
    ? 'Hours, booking rules, calendar and contact'
    : google?.needsReconnect
      ? 'Google Calendar needs reconnecting'
      : 'Connect Google Calendar and set your hours';
  const needs = !google?.connected;

  return (
    <nav className={`${rep.panel} ${css.entry}`} aria-label="Consultant">
      <Link href={MY_AVAILABILITY_HREF} className={p.row}>
        <span className={`${p.tile} ${needs ? p.tileAmber : p.tileLime}`} aria-hidden="true">
          <CalendarClock size={20} strokeWidth={2} />
        </span>
        <span className={p.rowText}>
          <span className={p.rowTitle}>My availability</span>
          <span className={p.rowSub}>{sub}</span>
        </span>
        <ChevronRight className={p.chev} size={20} aria-hidden="true" />
      </Link>
    </nav>
  );
}
