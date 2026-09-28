import Link from 'next/link';
import type { ReactNode } from 'react';
import { CircleUser, House, Plus, ReceiptText, Trophy, Wallet } from 'lucide-react';
import { rep } from '../../_mock';
import n from '../night.module.css';

export type Section = 'home' | 'sales' | 'log' | 'standings' | 'pay' | 'me';

const BASE = '/design-lab/a';

const RAIL = [
  { key: 'home', label: 'Home', href: `${BASE}/dashboard`, Icon: House },
  { key: 'log', label: 'Log a sale', href: `${BASE}/log-sale`, Icon: Plus },
  { key: 'sales', label: 'My sales', href: '#', Icon: ReceiptText },
  { key: 'pay', label: 'Pay', href: '#', Icon: Wallet },
  { key: 'standings', label: 'Standings', href: '#', Icon: Trophy },
] as const;

function Rail({ current }: { current: Section }) {
  return (
    <aside className={n.rail} aria-label="Portal">
      <div className={n.railBrand}>
        <Link href={`${BASE}/dashboard`} className={n.wordmark}>
          3C World Group
        </Link>
        <span className={n.railTag}>Rep console</span>
      </div>

      {current !== 'log' && (
        <Link href={`${BASE}/log-sale`} className={n.btnPrimary}>
          <Plus size={20} strokeWidth={2.25} aria-hidden />
          Log a sale
        </Link>
      )}

      <nav className={n.railNav} aria-label="Primary">
        {RAIL.filter((item) => item.key !== 'log' || current === 'log').map(({ key, label, href, Icon }) => (
          <Link key={key} href={href} className={n.railLink} aria-current={current === key ? 'page' : undefined}>
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <Link href="#" className={n.railUser}>
        <span className={n.avatar} aria-hidden>
          {rep.initials}
        </span>
        <span>
          <span className={n.railUserName}>
            {rep.name}
          </span>
          <span className={n.railUserTitle}>{rep.title}</span>
        </span>
      </Link>
    </aside>
  );
}

function BottomNav({ current }: { current: Section }) {
  const item = (key: Section, label: string, Icon: typeof House) => (
    <Link href={key === 'home' ? `${BASE}/dashboard` : '#'} className={n.navItem} aria-current={current === key ? 'page' : undefined}>
      <Icon size={22} strokeWidth={1.75} aria-hidden />
      {label}
    </Link>
  );
  return (
    <nav className={n.bottomNav} aria-label="Primary">
      {item('home', 'Home', House)}
      {item('sales', 'Sales', ReceiptText)}
      <Link href={`${BASE}/log-sale`} className={n.navLog}>
        <Plus size={24} strokeWidth={2.25} aria-hidden />
        Log sale
      </Link>
      {item('standings', 'Standings', Trophy)}
      {item('me', 'Me', CircleUser)}
    </nav>
  );
}

export function Masthead() {
  return (
    <header className={n.masthead}>
      <Link href={`${BASE}/dashboard`} className={n.wordmark}>
        3C World Group
      </Link>
      <Link href="#" className={n.avatarLink} aria-label={`${rep.name}, account`}>
        <span className={n.avatar}>{rep.initials}</span>
      </Link>
    </header>
  );
}

/** The page frame: desktop rail, content column, phone bottom nav. */
export function Frame({
  current,
  children,
  bottomNav = true,
}: {
  current: Section;
  children: ReactNode;
  bottomNav?: boolean;
}) {
  return (
    <div className={n.page}>
      <Rail current={current} />
      <main className={bottomNav ? n.main : n.mainNoNav}>{children}</main>
      {bottomNav && <BottomNav current={current} />}
    </div>
  );
}

export const money = (value: number) => `$${value.toLocaleString('en-US')}`;
