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
// says to go back to the app, where Setup picks the connection up. Opened
// inside the app itself, it forwards to Setup with the same outcome.
function Outcome() {
  const params = useSearchParams();
  const router = useRouter();
  const inApp = useIsNativeApp();
  const outcome = params.get('google');
  const connected = outcome === 'connected';

  useEffect(() => {
    if (inApp) router.replace(`/portal/admin/solar?tab=setup&${params.toString()}`);
  }, [inApp, params, router]);
  if (inApp) return <RepBoot />;

  return (
    <div className={rep.root}>
      <main className={s.wrap}>
        <section className={`${rep.panel} ${s.card}`} aria-labelledby="gcal-outcome">
          <Image src="/logo.webp" alt="3C World Group" width={550} height={516} sizes="48px" className={s.mark} priority />
          {connected ? (
            <CheckCircle2 size={32} aria-hidden="true" className={s.ok} />
          ) : (
            <CircleAlert size={32} aria-hidden="true" className={s.warn} />
          )}
          <h1 id="gcal-outcome" className={s.title}>
            {connected ? 'Connected.' : 'Google Calendar isn’t connected.'}
          </h1>
          {connected ? (
            <>
              <p className={s.lead}>You can go back to the app.</p>
              {params.get('freebusy') === 'off' ? (
                <p className={s.note}>
                  Free/busy wasn’t allowed, so homeowners still see every open time. Reconnect from Solar setup and allow
                  it to hide busy times.
                </p>
              ) : (
                <p className={s.note}>New bookings go on your Google Calendar, and busy times are hidden from homeowners.</p>
              )}
            </>
          ) : (
            <>
              <p className={s.lead}>{connectErrorText(params.get('reason'))}</p>
              <p className={s.note}>Go back to the app and try again from Solar setup.</p>
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
