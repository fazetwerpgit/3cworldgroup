'use client';

import { Suspense, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useIsNativeApp } from '@/lib/app/isNativeApp';
import { connectErrorText } from '@/lib/solar/google/status';
import { RepBoot } from '@/components/portal/rep/RepBoot';
import rep from '@/components/portal/rep/rep.module.css';
import s from './google-calendar.module.css';

// Where Google's sign-in lands when it was started in the 3C iOS app. Google
// refuses sign-in inside the app's WebView, so it ran in the app's browser
// sheet; this page (no sign-in needed: it shows only the outcome in the URL)
// says to go back to the app, where Setup (or My availability) picks the
// connection up. Opened inside the app itself, it forwards there with the same
// outcome: `back=availability` picks My availability, anything else Setup
// (fixed paths only, never one from the URL).
function Outcome() {
  const params = useSearchParams();
  const router = useRouter();
  const inApp = useIsNativeApp();
  const outcome = params.get('google');
  const connected = outcome === 'connected';

  useEffect(() => {
    if (!inApp) return;
    const next = new URLSearchParams(params.toString());
    const mine = next.get('back') === 'availability';
    next.delete('back');
    router.replace(mine ? `/portal/solar/availability?${next}` : `/portal/admin/solar?tab=setup&${next}`);
  }, [inApp, params, router]);
  if (inApp) return <RepBoot />;

  return (
    <div className={rep.root}>
      <main className={s.wrap}>
        <section className={`${rep.panel} ${s.card}`} aria-labelledby="gcal-outcome">
          <Image src="/logo.webp" alt="3C World Group" width={550} height={516} sizes="48px" className={s.mark} priority />
          <h1 id="gcal-outcome" className={s.title}>
            {connected ? (
              <CheckCircle2 size={28} aria-hidden="true" className={s.ok} />
            ) : (
              <CircleAlert size={28} aria-hidden="true" className={s.warn} />
            )}
            <span>{connected ? 'Google Calendar connected.' : 'Google Calendar isn’t connected.'}</span>
          </h1>
          {connected ? (
            <>
              <p className={s.lead}>You can go back to the app.</p>
              {params.get('freebusy') === 'off' ? (
                <p className={s.note}>
                  Free/busy wasn’t allowed, so homeowners still see every open time. Reconnect from the portal and allow
                  it to hide busy times.
                </p>
              ) : (
                <p className={s.note}>New bookings go on your Google Calendar, and busy times are hidden from homeowners.</p>
              )}
            </>
          ) : (
            <>
              <p className={s.lead}>{connectErrorText(params.get('reason'))}</p>
              <p className={s.note}>Go back to the app to try again.</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default function GoogleCalendarOutcomePage() {
  return (
    <Suspense fallback={<RepBoot />}>
      <Outcome />
    </Suspense>
  );
}
