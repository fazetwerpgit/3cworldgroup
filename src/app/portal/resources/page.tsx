'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { ProgressCard, RESOURCE_QUICK_LINKS, ShortsEmpty } from '@/components/portal/rep/RepLearn';
import { RepPayStructure } from '@/components/portal/rep/RepPayStructure';
import { CompPlanMatrix } from '@/components/resources/CompPlanMatrix';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import l from '@/components/portal/rep/rep-learn.module.css';

// The chrome (top bar, tab bar, auth gate) comes from ./layout.tsx: RepShell.
// /portal/links and /portal/pay-structure redirect here.
export default function ResourcesHubPage() {
  const { user, isRole, hasPermission } = useAuth();
  const { loading, fetchResources, fetchProgress, getOverallProgress, getIncompleteRequired } = useTraining();

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  const { completed, total } = getOverallProgress();
  // The comp plan carries the "3C Receives" margin, which is the finance tier's
  // alone: owner AND the finance permission, never an isRole('admin') check
  // (an owner satisfies that, but an admin must not satisfy this).
  const showCompPlan = isRole('owner') && hasPermission('finance:read');

  return (
    <div className={p.page}>
      <header className={p.head}>
        <h1 className={p.title}>Resources</h1>
      </header>

      <div className={`${l.layout} ${l.hub}`}>
        <div className={l.col}>
          <ProgressCard
            completed={Math.min(completed, total)}
            total={total}
            requiredLeft={getIncompleteRequired().length}
            loading={loading}
            link={{ href: '/portal/training', label: 'Open University' }}
          />

          <section className={s.panel} aria-labelledby="tools-title">
            <div className={s.panelHead}>
              <h2 id="tools-title" className={s.kicker}>Field tools</h2>
            </div>
            <ul className={p.rows}>
              {RESOURCE_QUICK_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <li key={link.title}>
                    <a className={p.row} href={link.url} target="_blank" rel="noopener noreferrer">
                      <span className={p.tile}>
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className={p.rowText}>
                        <span className={p.rowTitle}>{link.title}</span>
                        <span className={p.rowSub}>{link.description}</span>
                      </span>
                      <ExternalLink size={18} className={l.toolIcon} aria-label="Opens in a new tab" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

        </div>

        <div className={l.col}>
          <RepPayStructure />

          <section className={s.panel} aria-labelledby="shorts-title">
            <div className={s.panelHead}>
              <h2 id="shorts-title" className={s.kicker}>Short videos</h2>
              <Link href="/portal/training?tab=shorts" className={p.headLink}>
                See all <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <ShortsEmpty />
          </section>
        </div>
      </div>

      {/* Full width below the columns: 17 columns don't fit half a laptop screen. */}
      {showCompPlan && (
        <div className={`${s.panel} ${l.matrix}`}>
          <CompPlanMatrix />
        </div>
      )}
    </div>
  );
}
