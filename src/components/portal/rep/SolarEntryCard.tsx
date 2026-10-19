'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Sun } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import s from './rep.module.css';
import d from './rep-dashboard.module.css';

export const SOLAR_HREF = '/portal/solar';
export const SOLAR_DECK_HREF = '/portal/solar/present';

/**
 * Home's way into Solar, for whoever holds solar:read. `row` (a rep who also
 * sells fiber) is the compact AskEntryCard-style row to the Solar page.
 * `lead` (a solar-only rep) tops their Home: the deck's cover and Open deck,
 * which needs solar:write, so a read-only view shows the cover alone.
 * `action={false}` drops that button where the page already leads with one
 * (the Solar page's head).
 */
export function SolarEntryCard({ variant = 'row', action = true }: { variant?: 'row' | 'lead'; action?: boolean }) {
  const { hasPermission } = useAuth();
  if (!hasPermission('solar:read')) return null;

  if (variant === 'lead') {
    return (
      <section className={`${d.surface} ${d.solarLead}`} aria-labelledby="solar-lead-h">
        <Image
          src="/solar/home.webp"
          alt=""
          width={934}
          height={526}
          sizes="(min-width: 1024px) 640px, 100vw"
          className={d.solarLeadImg}
          priority
        />
        <div className={d.solarLeadBody}>
          <h2 id="solar-lead-h" className={d.solarLeadTitle}>
            Solar deck
          </h2>
          <p className={d.solarLeadSub}>Their bill, their savings and a consultation, all on one phone.</p>
          {action && hasPermission('solar:write') ? (
            <Link href={SOLAR_DECK_HREF} className={`${s.btnPrimary} ${d.solarLeadBtn}`}>
              <Sun size={20} strokeWidth={2.5} aria-hidden="true" />
              Open deck
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className={`${d.surface} ${d.askEntry}`} aria-label="Solar">
      <Link href={SOLAR_HREF} className={`${d.askRow} tap-press`}>
        <span className={d.askTile}>
          <Sun size={22} aria-hidden="true" />
        </span>
        <span className={d.askText}>
          <span className={d.askTitle}>Solar</span>
          <span className={d.askSub}>The pitch deck for your next homeowner.</span>
        </span>
        <ChevronRight size={20} className={d.askChev} aria-hidden="true" />
      </Link>
    </section>
  );
}
