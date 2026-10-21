'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { RepShell } from '@/components/portal/rep/RepShell';
import { AdminFailed, AdminNotice, AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { useMyConsultant, type MyConsultantDoc } from '@/components/portal/solar/useMyConsultant';
import { googleStatusOf, type GoogleCalendarStatus } from '@/lib/solar/google/status';
import {
  ConsultantPanel,
  hoursOf,
  useGoogleReturn,
  type Consultant,
  type ConsultantSettings,
} from '@/app/portal/admin/solar/SolarSetup';
import rep from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import css from './availability.module.css';

// /portal/solar/availability: a consultant's own card, the same one Admin >
// Solar > Setup shows, for someone who isn't an admin. The server only ever
// serves and saves the signed-in person's card here (consultants/[uid] checks
// the verified uid), and removing a consultant stays in Setup. The Google
// sign-in comes back to this page (returnTo 'availability'). Reached from the
// Sales tab's solar side, only for people who take consultations.

function Card({ doc, seeded: seededAtLoad }: { doc: MyConsultantDoc; seeded: boolean }) {
  const [consultant, setConsultant] = useState<Consultant>(() => ({
    uid: doc.consultantUid,
    name: doc.name,
    saved: hoursOf(doc),
    google: googleStatusOf(doc.googleCalendar),
  }));
  const [seeded, setSeeded] = useState(seededAtLoad);

  const onSaved = useCallback((_uid: string, saved: ConsultantSettings) => {
    // The first save writes the built-in hours, so they are saved from now on.
    setSeeded(false);
    setConsultant((c) => ({ ...c, saved }));
  }, []);
  const onGoogle = useCallback((_uid: string, google: GoogleCalendarStatus | undefined) => {
    setConsultant((c) => ({ ...c, google }));
  }, []);

  return (
    <ConsultantPanel
      consultant={consultant}
      seeded={seeded}
      removable={false}
      own
      onSaved={onSaved}
      onRemoved={() => {}}
      onGoogle={onGoogle}
      returnTo="availability"
    />
  );
}

function AvailabilityBody() {
  const { mine, retry } = useMyConsultant();
  const googleReturn = useGoogleReturn();

  return (
    <div className={`${p.page} ${css.page}`}>
      <header className={p.head}>
        <h1 className={p.title}>My availability</h1>
        <p className={p.lede}>
          When homeowners can book you, and how they reach you. Admins can change these too.
        </p>
      </header>

      {googleReturn.notice ? (
        <AdminNotice tone={googleReturn.notice.tone} onDismiss={googleReturn.dismiss}>
          {googleReturn.notice.text}
        </AdminNotice>
      ) : null}

      {mine.state === 'ready' ? (
        <>
          {mine.seeded ? (
            <AdminNotice tone="warn">
              These are your built-in hours. Homeowners book against them now; save once to make them yours, then
              connect your calendar.
            </AdminNotice>
          ) : null}
          <Card doc={mine.consultant} seeded={mine.seeded} />
        </>
      ) : mine.state === 'failed' ? (
        <section className={rep.panel} aria-label="My availability">
          <AdminFailed what="your availability" onRetry={retry} />
        </section>
      ) : mine.state === 'none' ? (
        <section className={`${rep.panel} ${css.none}`} aria-labelledby="availability-none">
          <h2 className={css.noneTitle} id="availability-none">
            You don’t take consultations yet
          </h2>
          <p className={css.noneText}>
            An admin adds consultants in Solar setup. Once you’re added, your hours and calendar live here.
          </p>
          <Link href="/portal/sales" className={css.noneLink}>
            Back to Sales
          </Link>
        </section>
      ) : (
        <section className={rep.panel} aria-label="My availability">
          <AdminSkeletonRows rows={5} label="Loading your availability" />
        </section>
      )}
    </div>
  );
}

export default function MyAvailabilityPage() {
  return (
    <RepShell task="My availability" back={{ href: '/portal/sales', label: 'Sales' }}>
      <AvailabilityBody />
    </RepShell>
  );
}
