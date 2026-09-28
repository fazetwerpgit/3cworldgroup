import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CircleUserRound, House, Plus, ReceiptText, Trophy } from 'lucide-react';
import { rep } from '../../_mock';
import n from '../native.module.css';

export const B_BASE = '/design-lab/b';

type Tab = 'home' | 'sales' | 'ranks' | 'profile';

const TABS: { id: Tab; label: string; side: string; href: string; Icon: typeof House }[] = [
  { id: 'home', label: 'Home', side: 'Home', href: `${B_BASE}/dashboard`, Icon: House },
  { id: 'sales', label: 'Sales', side: 'My sales', href: '#', Icon: ReceiptText },
  { id: 'ranks', label: 'Ranks', side: 'Leaderboard', href: '#', Icon: Trophy },
  { id: 'profile', label: 'Profile', side: 'Profile', href: '#', Icon: CircleUserRound },
];

export function Shell({ active, children }: { active: Tab; children: ReactNode }) {
  return (
    <div className={n.app}>
      <aside className={n.sidebar} aria-label="Portal">
        <Link href={`${B_BASE}/dashboard`} className={n.brand}>
          <Image src="/logo.webp" alt="" width={550} height={516} className={n.brandMark} sizes="36px" />
          <span>
            <span className={n.brandName}>3C World Group</span>
            <span className={n.brandSub}>Rep portal</span>
          </span>
        </Link>

        <Link href={`${B_BASE}/log-sale`} className={n.btnPrimary}>
          <Plus size={20} strokeWidth={2.5} aria-hidden />
          Log a sale
        </Link>

        <nav className={n.sideNav} aria-label="Primary">
          {TABS.map(({ id, side, href, Icon }) => (
            <Link
              key={id}
              href={href}
              className={id === active ? `${n.sideLink} ${n.sideLinkActive}` : n.sideLink}
              aria-current={id === active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={2} aria-hidden />
              {side}
            </Link>
          ))}
        </nav>

        <div className={n.sideProfile}>
          <span className={n.avatar} aria-hidden>
            {rep.initials}
          </span>
          <span>
            <span className={n.brandName}>{rep.name}</span>
            <span className={n.brandSub}>{rep.title}</span>
          </span>
        </div>
      </aside>

      <main className={n.main}>{children}</main>

      <div className={n.tabDock}>
        <nav className={n.tabBar} aria-label="Primary">
          {TABS.map(({ id, label, href, Icon }) => (
            <Link
              key={id}
              href={href}
              className={id === active ? `${n.tab} ${n.tabActive}` : n.tab}
              aria-current={id === active ? 'page' : undefined}
            >
              <Icon size={22} strokeWidth={id === active ? 2.25 : 2} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <Link href={`${B_BASE}/log-sale`} className={n.dockAction} aria-label="Log a sale">
          <Plus size={28} strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
