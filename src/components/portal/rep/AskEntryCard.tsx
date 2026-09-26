'use client';

import Link from 'next/link';
import { ChevronRight, MessageCircleQuestion } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { askOpenTo } from '@/lib/ask/flag';
import s from './rep.module.css';
import p from './rep-page.module.css';
import d from './rep-dashboard.module.css';

/** Home's compact way into Ask 3C. Hidden while the feature is off, or not yet open to this user. */
export function AskEntryCard() {
  const { user } = useAuth();
  if (!askOpenTo(user?.role, user?.uid)) return null;
  return (
    <section className={`${s.panel} ${d.askEntry}`} aria-label="Ask 3C">
      <Link href="/portal/ask" className={p.row}>
        <span className={`${p.tile} ${p.tileLime}`}>
          <MessageCircleQuestion size={20} aria-hidden="true" />
        </span>
        <span className={p.rowText}>
          <span className={p.rowTitle}>Ask 3C</span>
          <span className={p.rowSub}>Stuck on an order at the door? Ask here.</span>
        </span>
        <ChevronRight size={20} className={p.chev} aria-hidden="true" />
      </Link>
    </section>
  );
}
