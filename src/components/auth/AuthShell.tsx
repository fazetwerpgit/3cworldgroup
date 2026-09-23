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
 *
 * `statement` puts a brand statement beside the panel (sign in, sign up). Left
 * out, the panel sits alone in the middle (status screens).
 */
export function AuthShell({ children, statement }: { children: ReactNode; statement?: ReactNode }) {
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

        <main className={statement ? a.stage : a.stageSolo}>
          {statement ? <div className={a.statement}>{statement}</div> : null}
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

/** The sign-in statement: the portal's line, in the scoreboard face. */
export function PortalStatement() {
  return (
    <>
      <h2 className={a.display}>
        The day starts <em>here.</em>
      </h2>
      <p className={a.statementLede}>Your numbers, your team, your next move. All in one place.</p>
      <ul className={a.features}>
        <li>Live leaderboard</li>
        <li>Team chat</li>
        <li>Sales pipeline</li>
      </ul>
    </>
  );
}
