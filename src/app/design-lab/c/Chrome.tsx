import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, Home, ListChecks, Plus, Trophy, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { rep } from '../_mock';
import s from './scoreboard.module.css';

export const DASH = '/design-lab/c/dashboard';
export const LOG = '/design-lab/c/log-sale';

type Section = 'home' | 'log';

const deskLinks: { label: string; href: string; key?: Section }[] = [
  { label: 'Dashboard', href: DASH, key: 'home' },
  { label: 'Leaderboard', href: '#' },
  { label: 'My sales', href: '#' },
  { label: 'Pay', href: '#' },
];

export function TopBar({ section, task }: { section: Section; task?: { title: string } }) {
  return (
    <header className={s.topbar}>
      <div className={s.topbarInner}>
        {task ? (
          <Link href={DASH} className={`${s.back} ${s.phoneOnly}`} aria-label="Back to dashboard">
            <ChevronLeft size={24} strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
        <Link
          href={DASH}
          className={`${s.brand} ${task ? s.brandTask : ''}`}
          aria-label="3C World Group dashboard"
        >
          <Image src="/logo.webp" alt="" width={32} height={32} className={s.brandMark} />
          <span className={s.brandWord}>3C Console</span>
        </Link>
        {task ? <p className={`${s.barTitle} ${s.phoneOnly}`}>{task.title}</p> : null}

        <ul className={s.deskNav}>
          {deskLinks.map((l) => (
            <li key={l.label}>
              <Link
                href={l.href}
                className={s.navLink}
                aria-current={l.key === section ? 'page' : undefined}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link href={DASH} className={s.player} aria-label={`${rep.name}, profile`}>
          <span className={s.playerText}>
            <span className={s.playerName}>{rep.name}</span>
            <span className={s.playerRole}>{rep.title}</span>
          </span>
          <span className={s.avatar} aria-hidden>
            {rep.initials}
          </span>
        </Link>
        {section === 'log' ? null : (
          <Link href={LOG} className={`${s.btnPrimary} ${s.navCta}`}>
            <Plus size={18} strokeWidth={2.5} aria-hidden />
            Log sale
          </Link>
        )}
      </div>
    </header>
  );
}

const tabs = [
  { label: 'Home', href: DASH, icon: Home, key: 'home' as Section },
  { label: 'Board', href: '#', icon: Trophy },
  { label: 'Log sale', href: LOG, icon: Plus, key: 'log' as Section, log: true },
  { label: 'Sales', href: '#', icon: ListChecks },
  { label: 'Pay', href: '#', icon: Wallet },
];

export function TabBar({ section }: { section: Section }) {
  return (
    <nav className={s.tabbar} aria-label="Primary">
      <ul className={s.tabs}>
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.label}>
              <Link
                href={t.href}
                className={s.tab}
                aria-current={t.key === section ? 'page' : undefined}
              >
                {t.log ? (
                  <span className={s.tabLog}>
                    <Icon size={22} strokeWidth={2.5} aria-hidden />
                  </span>
                ) : (
                  <Icon size={22} strokeWidth={1.75} aria-hidden />
                )}
                {t.log ? <span className={s.srOnly}>{t.label}</span> : t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Shell({ children, withTabbar }: { children: ReactNode; withTabbar?: boolean }) {
  return <div className={`${s.root} ${withTabbar ? s.withTabbar : ''}`}>{children}</div>;
}
