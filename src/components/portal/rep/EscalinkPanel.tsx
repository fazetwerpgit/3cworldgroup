'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { ESCALINK_URL } from '@/lib/escalink';
import s from './rep.module.css';
import x from './rep-sale.module.css';

/**
 * A sale's way into EscaLink, T-Mobile's ticket app. The portal cannot file the
 * ticket (it lives in T-Mobile's Microsoft tenant), so it hands over everything
 * the intake asks for: copy, open EscaLink, paste.
 */
export function EscalinkPanel({ ticket, className = '' }: { ticket: string; className?: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyTicket = async () => {
    try {
      await navigator.clipboard.writeText(ticket);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <section className={`${s.panel} ${className}`} aria-labelledby="sale-escalink-h" data-part="escalink">
      <div className={s.panelHead}>
        <h2 id="sale-escalink-h" className={s.kicker}>
          T-Mobile support (EscaLink)
        </h2>
      </div>
      <div className={x.panelBody}>
        <p className={x.escText}>
          Install or order problem T-Mobile has to fix? Copy this sale&apos;s details, open EscaLink, choose
          Intake, then Install / Order Support, and paste. Add what happened and what you need.
        </p>
        <div className={x.escActions}>
          <button type="button" className={s.btnSecondary} onClick={() => void copyTicket()}>
            {copy === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copy === 'copied' ? 'Copied' : 'Copy details'}
          </button>
          <a className={s.btnSecondary} href={ESCALINK_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Open EscaLink
          </a>
        </div>
        {copy === 'failed' && (
          <>
            <p className={x.escError} role="alert">
              Your browser blocked copying. Press and hold the text below to copy it.
            </p>
            <pre className={x.escTicket}>{ticket}</pre>
          </>
        )}
        <Link className={x.escGuide} href="/portal/escalink">
          Which issue type to pick, and how EscaLink works
        </Link>
      </div>
    </section>
  );
}
