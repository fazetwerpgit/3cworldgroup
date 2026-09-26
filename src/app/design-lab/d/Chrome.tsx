import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, House, Plus, ReceiptText, Trophy, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { rep } from '../_mock';
import s from './scoreboard.module.css';

const BASE = '/design-lab/d';
export type Nav = 'float' | 'dock';
export type Section = 'home' | 'log';
export type Aura = 1 | 2 | 3;

/** Glow intensity for the lab comparison: ?aura=1 (default, current look) | 2 (more) | 3 (most). */
export function auraFrom(v: string | string[] | undefined): Aura {
  return v === '2' ? 2 : v === '3' ? 3 : 1;
}

/** Default is C's docked bar; ?nav=b switches to B's floating pill bar. */
export function navFrom(v: string | string[] | undefined): Nav {
  return v === 'b' ? 'float' : 'dock';
}

/** Carries the nav variant and aura level across links so the lab stays on one look. */
export function href(path: 'dashboard' | 'log-sale', nav: Nav, extra?: string, aura: Aura = 1) {
  const q = [nav === 'float' ? 'nav=b' : '', aura === 1 ? '' : `aura=${aura}`, extra ?? ''].filter(Boolean).join('&');
  return `${BASE}/${path}${q ? `?${q}` : ''}`;
}

export function TopBar({
  section,
  nav,
  aura = 1,
  task,
}: {
  section: Section;
  nav: Nav;
  aura?: Aura;
  task?: { title: string };
}) {
  const dash = href('dashboard', nav, undefined, aura);
  const deskLinks: { label: string; to: string; key?: Section }[] = [
    { label: 'Dashboard', to: dash, key: 'home' },
    { label: 'Leaderboard', to: '#' },
    { label: 'My sales', to: '#' },
    { label: 'Pay', to: '#' },
  ];
  return (
    <header className={s.topbar}>
      <div className={s.topbarInner}>
        {task ? (
          <Link href={dash} className={`${s.back} ${s.phoneOnly}`} aria-label="Back to dashboard">
            <ChevronLeft size={24} strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
        <Link href={dash} className={`${s.brand} ${task ? s.brandTask : ''}`} aria-label="3C World Group dashboard">
          <Image src="/logo.webp" alt="" width={550} height={516} sizes="34px" className={s.brandMark} />
          <span className={s.brandWord}>3C World Group</span>
        </Link>
        {task ? <p className={`${s.barTitle} ${s.phoneOnly}`}>{task.title}</p> : null}

        <ul className={s.deskNav}>
          {deskLinks.map((l) => (
            <li key={l.label}>
              <Link href={l.to} className={s.navLink} aria-current={l.key === section ? 'page' : undefined}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link href={dash} className={s.player} aria-label={`${rep.name}, profile`}>
          <span className={s.playerText}>
            <span className={s.playerName}>{rep.name}</span>
            <span className={s.playerRole}>{rep.title}</span>
          </span>
          <span className={s.avatar} aria-hidden>
            {rep.initials}
          </span>
        </Link>
        {section === 'log' ? null : (
          <Link href={href('log-sale', nav, undefined, aura)} className={`${s.btnPrimary} ${s.navCta}`}>
            <Plus size={18} strokeWidth={2.5} aria-hidden />
            Log sale
          </Link>
        )}
      </div>
    </header>
  );
}

const SIDE_TABS = [
  { label: 'Home', icon: House, key: 'home' as Section },
  { label: 'Sales', icon: ReceiptText },
  { label: 'Board', icon: Trophy },
  { label: 'Pay', icon: Wallet },
];

/** Phone navigation. `dock` (default) = C's full-width docked bar with Log sale in the centre slot;
    `float` (?nav=b) = B's pill bar + separate round Log sale button, hidden on the log-sale pages. */
export function TabBar({ section, nav, aura = 1 }: { section: Section; nav: Nav; aura?: Aura }) {
  const tabHref = (key?: Section) => (key === 'home' ? href('dashboard', nav, undefined, aura) : '#');
  const logHref = href('log-sale', nav, undefined, aura);

  if (nav === 'dock') {
    const [a, b, c, d] = SIDE_TABS;
    const order = [a, b, null, c, d];
    return (
      <nav className={s.tabbar} aria-label="Primary">
        <ul className={s.tabs}>
          {order.map((t) =>
            t ? (
              <li key={t.label}>
                <Link href={tabHref(t.key)} className={s.tab} aria-current={t.key === section ? 'page' : undefined}>
                  <t.icon size={22} strokeWidth={1.75} aria-hidden />
                  {t.label}
                </Link>
              </li>
            ) : (
              <li key="log">
                {section === 'log' ? (
                  // Already logging: show the slot as the current tab, not as a "start a sale" action.
                  <span className={s.tab} aria-current="page">
                    <span className={`${s.tabLog} ${s.tabLogOn}`}>
                      <Plus size={20} strokeWidth={2.5} aria-hidden />
                    </span>
                    Log sale
                  </span>
                ) : (
                  <Link href={logHref} className={s.tab}>
                    <span className={s.tabLog}>
                      <Plus size={20} strokeWidth={2.5} aria-hidden />
                    </span>
                    Log sale
                  </Link>
                )}
              </li>
            ),
          )}
        </ul>
      </nav>
    );
  }

  return (
    <div className={s.floatDock}>
      <nav className={s.floatBar} aria-label="Primary">
        {SIDE_TABS.map((t) => (
          <Link
            key={t.label}
            href={tabHref(t.key)}
            className={s.floatTab}
            aria-current={t.key === section ? 'page' : undefined}
          >
            <t.icon size={22} strokeWidth={t.key === section ? 2.25 : 1.75} aria-hidden />
            {t.label}
          </Link>
        ))}
      </nav>
      {section === 'log' ? null : (
        <Link href={logHref} className={s.floatLog}>
          <Plus size={22} strokeWidth={2.75} aria-hidden />
          <span>Log sale</span>
        </Link>
      )}
    </div>
  );
}

export function Shell({ children, withTabbar, aura = 1 }: { children: ReactNode; withTabbar?: boolean; aura?: Aura }) {
  return (
    <div className={`${s.root} ${withTabbar ? s.withTabbar : ''}`} data-aura={aura}>
      {children}
    </div>
  );
}
