'use client';

import type { RecentSale } from '@/lib/leaderboard/team';
import { recentSaleLabel, recentSaleWhen, useMinuteClock } from './belowPodium';
import styles from './leaderboard.module.css';

/** The newest sales team-wide, one plain row each: "Ana R. · 2 Gig", then when.
 *  Names, plans and times only: no customer, no money. */
export function RecentSales({ sales }: { sales: RecentSale[] }) {
  const now = useMinuteClock();
  if (sales.length === 0) return null;

  return (
    <section aria-label="Recent sales" className={styles.feed}>
      <header className={styles.band}>
        <h2 className={styles.bandTitle}>Recent sales</h2>
      </header>
      <ol>
        {sales.map((sale, index) => (
          <li key={`${sale.at}-${index}`}>
            <span>{recentSaleLabel(sale)}</span>
            <time dateTime={sale.at}>{recentSaleWhen(sale, now)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
