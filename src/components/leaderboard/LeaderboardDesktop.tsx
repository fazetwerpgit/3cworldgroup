'use client';

/* The desktop leaderboard (1024px and up), in direction C.

   The same pieces as the phone page, arranged across the width: the podium on
   its stage beside a side column (your standing with its chase line, and the
   weekly challenge), then the ranks as one full-width scoreboard with the
   columns a desk has room for: movement, 7-day trend, score, gap to next.

   `active` is false while the phone layout is the visible one. The
   desktop-only calls behind it — the weekly-challenge standing, the challenge
   target and the minute clock — stay off in that case; nothing here is on
   screen to need them. */

import { useEffect, useState, type CSSProperties } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Flame } from 'lucide-react';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { auth } from '@/lib/firebase/config';
import { weekTimeLeft } from '@/lib/dashboard/repSummary';
import { Avatar } from './Avatar';
import { LeaderboardFilters } from './LeaderboardFilters';
import { RowsSkeleton, StageSkeleton } from './LeaderboardSkeleton';
import { LeaderboardStage } from './LeaderboardStage';
import {
  EmptyState,
  formatLeaderboardValue,
  leaderboardUnit,
  leaderboardValue,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
} from './LeaderboardTable';
import { periodLabel } from './PeriodCountdown';
import { Podium } from './Podium';
import { Sparkline } from './Sparkline';
import styles from './leaderboard.module.css';
import desk from './leaderboard-desk.module.css';

const format = formatLeaderboardValue;

function ordinal(rank: number) {
  const tens = rank % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  if (rank % 10 === 1) return 'st';
  if (rank % 10 === 2) return 'nd';
  if (rank % 10 === 3) return 'rd';
  return 'th';
}

/* ---------- your standing ---------- */

interface Chase {
  /** The line under the rank. `lead` is the bold part. */
  lead?: string;
  text: string;
  /** How far along the gap to the next rank, 0–100; null draws no track. */
  progress: number | null;
}

/** Where you stand against your neighbours: the gap to the rank above, or your
 *  lead over #2. */
function chaseFor(
  ordered: LeaderboardEntry[],
  currentUser: LeaderboardEntry | null | undefined,
  metric: LeaderboardMetric
): Chase {
  const unit = leaderboardUnit(metric);
  if (!currentUser) return { text: 'Your first approved sale puts you on the board', progress: null };

  const value = leaderboardValue(currentUser, metric);
  const above = ordered.find((entry) => entry.rank === currentUser.rank - 1);
  const below = ordered.find((entry) => entry.rank === currentUser.rank + 1);

  if (currentUser.rank === 1) {
    if (!below) return { text: 'Only rep on the board', progress: 100 };
    const lead = Math.max(0, value - leaderboardValue(below, metric));
    return { lead: `${format(lead)} ${unit}`, text: ' ahead of #2', progress: 100 };
  }

  if (!above) return { text: 'The next rank is outside this view', progress: null };

  const target = leaderboardValue(above, metric);
  const gap = Math.max(0, target - value);
  return {
    lead: `${format(gap)} ${unit}`,
    text: ` behind ${above.salesRepName} for #${above.rank}`,
    progress: target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0,
  };
}

/** A thin lime fill that grows in from the left once it is on screen. */
function Track({ percent }: { percent: number }) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setStarted(true));
    return () => window.cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <span className={desk.track} aria-hidden="true">
      <span className={desk.trackFill} style={{ transform: `scaleX(${started ? percent / 100 : 0})` }} />
    </span>
  );
}

function Standing({
  ordered,
  currentUser,
  metric,
  name,
  loading,
}: {
  ordered: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  metric: LeaderboardMetric;
  name: string;
  loading: boolean;
}) {
  const chase = chaseFor(ordered, currentUser, metric);
  const rank = currentUser?.rank;

  return (
    <section className={`${desk.card} ${desk.standing}`} aria-labelledby="standing-heading">
      <div className={styles.band}>
        <h2 id="standing-heading" className={styles.bandTitle}>Your standing</h2>
        {ordered.length > 0 ? <span className={styles.bandMeta}>{ordered.length} ranked</span> : null}
      </div>
      <div className={desk.standingBody}>
        <p className={desk.bigRank}>
          {loading || !rank ? (
            <>
              <span className={desk.bigDash} aria-hidden="true">—</span>
              <span className={styles.srOnly}>{loading ? 'Loading' : 'Not ranked'}</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">
                {rank}
                <sup>{ordinal(rank)}</sup>
              </span>
              <span className={styles.srOnly}>Rank {rank}</span>
            </>
          )}
        </p>
        <div className={desk.standingWho}>
          <strong>{name}</strong>
          <span>
            {format(currentUser?.totalPoints ?? 0)} pts · {format(currentUser?.totalSales ?? 0)} sales
          </span>
        </div>
      </div>
      {loading ? null : (
        <p className={desk.chase}>
          {chase.progress !== null ? <Track percent={chase.progress} /> : null}
          <span>
            {chase.lead ? <b>{chase.lead}</b> : null}
            {chase.text}
          </span>
        </p>
      )}
    </section>
  );
}

/* ---------- weekly challenge ---------- */

// `target` is null until the setting loads; a failed read says so rather than
// showing a made-up target.
function WeeklyChallenge({
  sales,
  loading,
  target,
  failed,
  onRetry,
}: {
  sales: number | null;
  loading: boolean;
  target: number | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const pending = loading || sales === null;
  const done = target === null || pending ? 0 : Math.min(sales, target);
  const complete = target !== null && !pending && done >= target;

  return (
    <section className={desk.card} aria-labelledby="challenge-heading">
      <div className={styles.band}>
        <h2 id="challenge-heading" className={styles.bandTitle}>Weekly challenge</h2>
        <span className={styles.bandMeta}>{weekTimeLeft(now)}</span>
      </div>
      {target === null ? (
        <div className={desk.challengeBody}>
          {failed ? (
            <p className={desk.challengeNote} role="alert">
              Couldn&apos;t load
              <button type="button" className={desk.retry} onClick={onRetry}>
                Retry
              </button>
            </p>
          ) : (
            <p className={desk.challengeNote}>Loading</p>
          )}
        </div>
      ) : (
        <div className={desk.challengeBody}>
          <p className={desk.challengeScore}>
            <span aria-hidden="true">
              {done}
              <span className={desk.challengeOf}>/{target}</span>
            </span>
            <span className={styles.srOnly}>
              {done} of {target}
            </span>
          </p>
          {target <= 20 ? (
            <span className={desk.segs} aria-hidden="true">
              {Array.from({ length: target }, (_, index) => (
                <span
                  key={index}
                  className={index < done ? desk.segOn : undefined}
                  style={{ '--n': index } as CSSProperties}
                />
              ))}
            </span>
          ) : (
            <Track percent={target > 0 ? Math.round((done / target) * 100) : 0} />
          )}
          <p className={desk.challengeNote}>
            {pending ? (
              'Loading'
            ) : complete ? (
              <span>
                <b className={desk.win}>Challenge complete.</b> {target} of {target}
              </span>
            ) : (
              <span>
                <b>{target - done} more</b> to close {target} sales by Saturday
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

/* ---------- ranks ---------- */

function Movement({ movement, noHistory }: { movement: number | null | undefined; noHistory: boolean }) {
  if (noHistory || movement === 0) {
    return <span className={desk.none} aria-hidden="true">–</span>;
  }
  if (movement === null || movement === undefined) {
    return <span className={desk.newTag}>New</span>;
  }
  const up = movement > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span className={up ? desk.moveUp : desk.moveDown}>
      <Arrow size={12} strokeWidth={2.5} aria-hidden="true" />
      {Math.abs(movement)}
      <span className={styles.srOnly}>
        {up ? 'up' : 'down'} {Math.abs(movement)} since yesterday
      </span>
    </span>
  );
}

function Ranks({
  ordered,
  currentUser,
  metric,
}: {
  ordered: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  metric: LeaderboardMetric;
}) {
  const rest = ordered.filter((entry) => entry.rank >= 4);
  if (rest.length === 0) return null;
  const unit = leaderboardUnit(metric);
  const noHistory = ordered.every((entry) => (entry.movement ?? null) === null);

  return (
    <section className={`${styles.rows} ${desk.ranks}`} aria-label="Ranking">
      <header className={styles.band}>
        <h2 className={styles.bandTitle}>Ranks 4–{rest[rest.length - 1].rank}</h2>
        <span className={styles.bandMeta}>Movement since yesterday</span>
      </header>
      <p className={`${desk.grid} ${desk.colHead}`} aria-hidden="true">
        <span>Rank / move</span>
        <span>Rep</span>
        <span>7-day trend</span>
        <span className={desk.right}>{metric === 'totalPoints' ? 'Points' : 'Sales'}</span>
        <span className={desk.right}>Gap to next</span>
      </p>
      {rest.map((entry) => {
        const mine = entry.salesRepId === currentUser?.salesRepId;
        const above = ordered.find((candidate) => candidate.rank === entry.rank - 1);
        const below = ordered.find((candidate) => candidate.rank === entry.rank + 1);
        const value = leaderboardValue(entry, metric);
        const aboveValue = above ? leaderboardValue(above, metric) : 0;
        const gap = above && below ? Math.max(0, aboveValue - value) : null;

        return (
          <div
            key={entry.salesRepId}
            className={`${desk.grid} ${desk.row} ${mine ? `${styles.rowMine} ${desk.rowMine}` : ''}`}
            data-current-user={mine || undefined}
          >
            <span className={desk.rankCell}>
              <span className={styles.rank}>{String(entry.rank).padStart(2, '0')}</span>
              <Movement movement={entry.movement} noHistory={noHistory} />
            </span>
            <span className={desk.rep}>
              <Avatar entry={entry} />
              <span className={desk.repText}>
                <strong className={styles.rowName}>
                  <span>{entry.salesRepName}</span>
                  {mine ? <em>You</em> : null}
                </strong>
                <span className={desk.repMeta}>
                  {format(entry.totalSales)} sales
                  {entry.streakDays && entry.streakDays >= 2 ? (
                    <span className={desk.streak}>
                      <Flame size={12} aria-hidden="true" />
                      {entry.streakDays}-day streak
                    </span>
                  ) : null}
                </span>
              </span>
            </span>
            <span className={desk.trend}>
              <Sparkline spark={entry.spark ?? []} mine={mine} />
            </span>
            <span className={`${desk.score} ${desk.right}`}>
              {format(value)} <small>{unit}</small>
            </span>
            <span className={`${desk.gap} ${desk.right}`}>
              {gap === null ? <span className={desk.none}>—</span> : `${format(gap)} ${unit}`}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/* ---------- page ---------- */

interface LeaderboardDesktopProps {
  active: boolean;
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  loading: boolean;
  error: string | null;
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  onMetricChange: (metric: LeaderboardMetric) => void;
  viewerName?: string | null;
}

export interface WeeklyChallengeState {
  /** Sales logged this week (submitted scope); null while unknown. */
  sales: number | null;
  loading: boolean;
  /** Null until the setting loads. */
  target: number | null;
  failed: boolean;
  onRetry: () => void;
}

/** The desktop page with its desktop-only data: the weekly-challenge standing
 *  and target. Everything else comes from the route's one board fetch. */
export function LeaderboardDesktop({ active, ...props }: LeaderboardDesktopProps) {
  const { currentUser: weeklyCurrentUser, loading: weeklyLoading, fetchLeaderboard: fetchWeeklyLeaderboard } = useLeaderboard();
  const [challengeTarget, setChallengeTarget] = useState<number | null>(null);
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [challengeAttempt, setChallengeAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    // 'submitted' scope: the challenge counts sales as reps log them,
    // not only after admin approval.
    fetchWeeklyLeaderboard('week', 'totalSales', 1, 'submitted');
  }, [active, fetchWeeklyLeaderboard]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch('/api/portal/settings/weekly-challenge', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) throw new Error('Failed to load weekly challenge');
        const data = await response.json();
        if (typeof data.targetSales !== 'number') throw new Error('Weekly challenge target missing');
        if (!cancelled) {
          setChallengeTarget(data.targetSales);
          setChallengeFailed(false);
        }
      } catch {
        // Never fall back to a made-up target: the card says it couldn't load.
        if (!cancelled) setChallengeFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, challengeAttempt]);

  // Nothing below is on screen on a phone, so the whole tree stays unbuilt there.
  if (!active) return null;

  const challenge: WeeklyChallengeState = {
    sales: weeklyLoading ? weeklyCurrentUser?.totalSales ?? null : weeklyCurrentUser?.totalSales ?? 0,
    loading: weeklyLoading,
    target: challengeTarget,
    failed: challengeFailed,
    onRetry: () => {
      setChallengeFailed(false);
      setChallengeAttempt((value) => value + 1);
    },
  };

  return <LeaderboardDesktopView {...props} challenge={challenge} />;
}

export function LeaderboardDesktopView({
  entries,
  currentUser,
  loading,
  error,
  period,
  metric,
  onPeriodChange,
  onMetricChange,
  viewerName,
  challenge,
}: Omit<LeaderboardDesktopProps, 'active'> & { challenge: WeeklyChallengeState }) {
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const name = currentUser?.salesRepName ?? viewerName ?? 'You';

  return (
    <div className={`${styles.scope} ${desk.page}`}>
      <header className={desk.head}>
        <div className={styles.head}>
          <h1>Leaderboard</h1>
          <p>{periodLabel(period, metric)}</p>
        </div>
        <LeaderboardFilters
          period={period}
          metric={metric}
          onPeriodChange={onPeriodChange}
          onMetricChange={onMetricChange}
        />
      </header>

      {error ? (
        <div className={`${styles.error} ${desk.error}`} role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className={desk.top}>
        {loading ? (
          <StageSkeleton className={desk.stage} />
        ) : (
          <LeaderboardStage period={period} className={desk.stage}>
            <Podium entries={ordered.filter((entry) => entry.rank <= 3)} currentUser={currentUser} metric={metric} />
          </LeaderboardStage>
        )}
        <div className={desk.side}>
          <Standing ordered={ordered} currentUser={currentUser} metric={metric} name={name} loading={loading} />
          <WeeklyChallenge {...challenge} />
        </div>
      </div>

      {loading ? (
        <div aria-label="Loading leaderboard" aria-busy="true">
          <RowsSkeleton rows={5} />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <Ranks ordered={ordered} currentUser={currentUser} metric={metric} />
      )}

      <footer className={desk.note}>
        <span>Rankings use approved sales for the selected period.</span>
        <span>Point values vary by product and plan.</span>
      </footer>
    </div>
  );
}
