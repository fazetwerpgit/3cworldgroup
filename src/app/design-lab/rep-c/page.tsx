'use client';

import { useState, type ReactNode } from 'react';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { REP_TABS } from '@/components/portal/rep/repNav';
import { RepHomeView, type TodayItem } from '@/components/portal/rep/RepDashboard';
import { PayHelpSheet } from '@/components/portal/rep/PayHelpSheet';
import type { PaySummary, RecentSaleRow, Standing } from '@/lib/dashboard/repSummary';
import s from '@/components/portal/rep/rep.module.css';

// Dev-only harness: renders the C rep views with fake data, no auth, no Firebase.
const noon = (m: number, d: number) => new Date(2026, m - 1, d, 12);

const PAY: PaySummary = {
  estThisMonth: 2340,
  deltaPct: 12,
  estNoDate: 210,
  estMissed: null,
  counts: { installed: 6, scheduled: 3, attention: 1 },
  monthCount: 10,
  payout: {
    window: { start: noon(9, 28), end: noon(10, 3), installFrom: noon(9, 15), installTo: noon(9, 21) },
    amount: 1120,
    count: 4,
    scheduled: 1,
  },
};

const STANDING: Standing = {
  rank: 4,
  of: 18,
  points: 1280,
  ahead: { name: 'Tyler B.', rank: 3, points: 1340, gap: 60 },
  leadBy: null,
  tiedWith: null,
  movement: 2,
};

const ROWS: RecentSaleRow[] = [
  { id: '1', customer: 'Dana Alvarez', plan: 'TFiber 1 Gig', carrier: 'T-Fiber', planShort: '1 Gig', address: '1180 Birch Ln', status: 'installed', installDate: noon(9, 19), estPay: 180, payoutLabel: 'Sep 28 – Oct 3' },
  { id: '2', customer: 'Sean Brennan', plan: 'AT&T Internet 500', carrier: 'AT&T', planShort: '500', address: '42 Harbor Ct', status: 'scheduled', installDate: noon(9, 26), estPay: 225, payoutLabel: null },
  { id: '3', customer: 'Ada Okafor', plan: 'TFiber 2 Gig', carrier: 'T-Fiber', planShort: '2 Gig', address: '9 Wren St', status: 'needs-date', installDate: null, estPay: 210, payoutLabel: null },
  { id: '4', customer: 'Lee Whitfield', plan: 'Frontier Fiber 1 Gig', carrier: 'Frontier', planShort: 'Fiber 1 Gig', address: '300 Elm Ave', status: 'missed', installDate: noon(9, 18), estPay: 125, payoutLabel: null },
  { id: '5', customer: 'Kim Park', plan: 'Xfinity 800', carrier: 'Xfinity', planShort: '800', address: '77 Oak Dr', status: 'cancelled', installDate: null, estPay: null, payoutLabel: null },
];

const TODAY: TodayItem[] = [
  { kind: 'call', call: { id: 'c1', title: 'Team huddle', day: 'wednesday' as never, time: '10:30', meetLink: 'https://meet.example.com/x' } },
  { kind: 'date', row: { id: '3', customer: 'Ada Okafor', plan: 'TFiber 2 Gig', missed: false, missedDay: null, missedNote: null } },
  { kind: 'date', row: { id: '4', customer: 'Lee Whitfield', plan: 'Frontier Fiber 1 Gig', missed: true, missedDay: '2026-09-19', missedNote: 'Sep 19 · Customer not home' } },
];

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={s.root} data-shell="rep">
      <header className={s.topbar}>
        <div className={s.topbarInner}>Harness</div>
      </header>
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>{children}</div>
      </main>
      <BodyLayer>
        <nav className={s.tabbar} aria-label="Primary">
          <ul className={s.tabs}>
            {REP_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <li key={tab.href}>
                  <a href="#" className={s.tab}>
                    {tab.log ? (
                      <span className={s.tabLog}>
                        <Icon size={20} />
                      </span>
                    ) : (
                      <span className={s.tabIcon}>
                        <Icon size={22} />
                      </span>
                    )}
                    {tab.short}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </BodyLayer>
    </div>
  );
}

export default function RepCHarness() {
  const [help, setHelp] = useState(false);
  const state = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('state') : null;
  const loading = state === 'loading';

  return (
    <Shell>
      <RepHomeView
        firstName="Marcus"
        payStatus={loading ? 'loading' : 'ready'}
        pay={loading ? null : PAY}
        hasPlan
        zeroSales={state === 'zero'}
        canLog
        carrierFailed={state === 'carrier'}
        standing={loading ? { status: 'loading' } : { status: 'ready', data: STANDING }}
        challenge={loading ? { status: 'loading' } : { status: 'ready', data: { target: 10, done: 7 } }}
        timeLeft="3d 6h left"
        rows={ROWS}
        todayItems={loading ? [] : TODAY}
        todayLoading={loading}
        extraDates={1}
        callsFailed={false}
        onHelp={() => setHelp(true)}
        onRetry={() => {}}
        onSetDate={() => {}}
      />
      {help ? <PayHelpSheet onClose={() => setHelp(false)} /> : null}
    </Shell>
  );
}
