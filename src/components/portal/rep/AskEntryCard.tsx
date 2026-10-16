'use client';

import Link from 'next/link';
import { ChevronRight, MessageCircleQuestion } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { askOpenTo } from '@/lib/ask/flag';
import d from './rep-dashboard.module.css';

/** Home's compact way into Ask 3C. Hidden while the feature is off, or not yet open to this user. */
export function AskEntryCard() {
  const { user } = useAuth();
  if (!askOpenTo(user?.role, user?.uid)) return null;
  return (
    <section className={`${d.surface} ${d.askEntry}`} aria-label="Ask 3C">
      <Link href="/portal/ask" className={d.askRow}>
        <span className={d.askTile}>
          <MessageCircleQuestion size={22} aria-hidden="true" />
        </span>
        <span className={d.askText}>
          <span className={d.askTitle}>Ask 3C</span>
          <span className={d.askSub}>Stuck on an order at the door? Ask here.</span>
        </span>
        <ChevronRight size={20} className={d.askChev} aria-hidden="true" />
      </Link>
    </section>
  );
}
