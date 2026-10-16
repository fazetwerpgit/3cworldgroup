'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import LearnPage from '@/app/portal/learn/page';
import CallsPage from '@/app/portal/calls/page';
import { RepAsk } from '@/components/portal/rep/RepAsk';
import { P2Harness } from './Harness';

// Dev-only: ?view=learn|ask|calls (Learn's own ?tab=training works too),
// &as=owner for the owner view, &empty=1 for an empty call schedule.
function View() {
  const params = useSearchParams();
  const view = params.get('view') ?? 'learn';
  const owner = params.get('as') === 'owner';
  return (
    <P2Harness owner={owner} emptyCalls={params.get('empty') === '1'}>
      {view === 'ask' ? <RepAsk /> : view === 'calls' ? <CallsPage /> : <LearnPage />}
    </P2Harness>
  );
}

export default function PassP2Lab() {
  return (
    <Suspense fallback={null}>
      <View />
    </Suspense>
  );
}
