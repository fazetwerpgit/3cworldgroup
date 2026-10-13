import { formatPlanMix, type PlanMixEntry } from '@/lib/sales/planMix';
import styles from './leaderboard.module.css';

/** "10× 1 Gig · 6× 2 Gig · 4× 300" under a name: counts only, one line, nothing when empty. */
export function PlanMixLine({ mix, className }: { mix?: PlanMixEntry[] | null; className?: string }) {
  const line = formatPlanMix(mix);
  if (!line) return null;
  return (
    <span className={className} data-testid="plan-mix">
      <span className={styles.srOnly}>Plan mix: </span>
      {line}
    </span>
  );
}
