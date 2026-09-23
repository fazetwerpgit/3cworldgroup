import { LeaderboardRoute } from '@/components/leaderboard/LeaderboardRoute';
import '@/styles/sweep-rep-b.css';

// The chrome (top bar, tab bar, auth gate) comes from ./layout.tsx: RepShell.
export default function LeaderboardPage() {
  return <LeaderboardRoute />;
}
