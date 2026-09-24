'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { RowsSkeleton } from '@/components/portal/rep/RepLearn';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import { PayAndLinks } from './PayAndLinks';
import { Training } from './Training';

const LEARN_TABS = [
  { key: 'pay', label: 'Pay & links' },
  { key: 'training', label: 'Training' },
] as const;

// Learn = the old Resources and University pages as two tabs (?tab=pay |
// training). /portal/resources, /portal/training, /portal/links,
// /portal/pay-structure and /portal/shorts redirect here.
function Learn() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const canTrain = hasPermission('training:read');
  const tab = canTrain && params.get('tab') === 'training' ? 'training' : 'pay';

  return (
    <div className={p.page}>
      <header className={p.head}>
        <h1 className={p.title}>Learn</h1>
      </header>

      {canTrain ? (
        <div className={p.tabs} role="tablist" aria-label="Learn sections">
          {LEARN_TABS.map((item) => (
            <button
              key={item.key}
              className={p.tab}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => router.replace(`/portal/learn?tab=${item.key}`, { scroll: false })}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'training' ? <Training /> : <PayAndLinks />}
    </div>
  );
}

export default function LearnPage() {
  return (
    <Suspense
      fallback={
        <section className={s.panel}>
          <RowsSkeleton label="Loading" />
        </section>
      }
    >
      <Learn />
    </Suspense>
  );
}
