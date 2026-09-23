'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import s from '@/components/portal/rep/rep.module.css';
import a from './auth.module.css';

/**
 * Direction D ground for the screens with no signed-in user (sign in, sign up,
 * pending approval, profile retry, the portal error boundary): the rep shell's
 * navy ground and light, the logo and Bebas wordmark, one panel. There is no
 * RepShell here because there is no user to build its nav for.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={s.layer}>
      <div className={a.screen}>
        <header className={a.top}>
          <Link href="/" className={a.brand} aria-label="3C World Group home">
            <Image src="/logo.webp" alt="" width={550} height={516} sizes="34px" className={a.brandMark} priority />
            <span className={a.brandWord}>3C World Group</span>
          </Link>
          <span className={a.brandTag}>Employee portal</span>
        </header>

        <main className={a.stage}>
          <div className={`${s.panel} ${a.card}`}>{children}</div>
        </main>

        <footer className={a.foot}>
          <Link href="/" className={a.footLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to main site
          </Link>
        </footer>
      </div>
    </div>
  );
}
