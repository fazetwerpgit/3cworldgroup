'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import s from '@/components/portal/rep/rep.module.css';
import a from './auth.module.css';
import { useIsNativeApp } from '@/lib/app/isNativeApp';

/**
 * Direction D ground for the screens with no signed-in user (sign in, sign up,
 * pending approval, profile retry, the portal error boundary, the invite-link
 * onboarding form): the rep shell's navy ground and light, the logo and Bebas
 * wordmark, one panel. There is no RepShell here because there is no user to
 * build its nav for. `wide` drops the single panel for a long form that lays
 * out its own panels.
 */
export function AuthShell({
  children,
  tag = 'Employee portal',
  wide = false,
}: {
  children: ReactNode;
  tag?: string;
  wide?: boolean;
}) {
  // Inside the iOS app there is no marketing site to go back to: the brand is
  // a plain mark and the "Back to main site" link is gone.
  const inApp = useIsNativeApp();
  const brand = (
    <>
      <Image src="/logo.webp" alt="" width={550} height={516} sizes="34px" className={a.brandMark} priority />
      <span className={a.brandWord}>3C World Group</span>
    </>
  );
  return (
    <div className={s.layer}>
      <div className={a.screen}>
        <header className={a.top}>
          {inApp ? (
            <span className={a.brand}>{brand}</span>
          ) : (
            <Link href="/" className={a.brand} aria-label="3C World Group home">
              {brand}
            </Link>
          )}
          <span className={a.brandTag}>{tag}</span>
        </header>

        <main className={wide ? `${a.stage} ${a.stageWide}` : a.stage}>
          {wide ? children : <div className={`${s.panel} ${a.card}`}>{children}</div>}
        </main>

        {inApp ? null : (
          <footer className={a.foot}>
            <Link href="/" className={a.footLink}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to main site
            </Link>
          </footer>
        )}
      </div>
    </div>
  );
}
