'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpenText,
  ChevronRight,
  ClipboardCheck,
  Phone,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { auth } from '@/lib/firebase/config';
import { useCountUp } from '@/hooks/useCountUp';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { isAbortError } from '@/lib/fetch/isAbortError';
import { RoleDisplayNames, getEffectiveRole } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

interface SalesStats {
  totalSales: number;
  totalPoints: number;
  approvedPoints: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  salesChange: number;
  pointsChange: number;
}

interface LeaderboardEntry {
  salesRepId: string;
  salesRepName: string;
  rank: number;
  totalPoints: number;
  totalSales: number;
}

interface QueueItem {
  key: string;
  title: string;
  meta: string;
  tail: string;
  href: string;
  icon: 'review' | 'invite' | 'calls' | 'onboard' | 'assign';
  admin?: boolean;
}

const darkMetallicNumberStyle: CSSProperties = {
  backgroundImage: 'linear-gradient(180deg, #fff 0%, #dbe4ed 38%, #7f8c9b 80%, #f5f7f8 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
};

const lightMetallicNumberStyle: CSSProperties = {
  backgroundImage: 'linear-gradient(180deg, #0A1F44 0%, #1e3556 38%, #3a4f6e 80%, #10284d 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
};

interface TimeContext {
  greeting: string;
  dateLabel: string;
  weekdayLabel: string;
  refreshedLabel: string;
}

const initialTimeContext: TimeContext = {
  greeting: 'Good evening',
  dateLabel: '—',
  weekdayLabel: '—',
  refreshedLabel: '—',
};

function getTimeContext(): TimeContext {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return {
    greeting,
    dateLabel: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    weekdayLabel: now.toLocaleDateString('en-US', { weekday: 'long' }),
    refreshedLabel: now
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/Chicago' })
      .replace(/C[DS]T/, 'CT'),
  };
}

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

function CountUpNumber({ value }: { value: number }) {
  const count = useCountUp(value, 650);
  return <>{formatNumber(count)}</>;
}

function Greeting({ firstName, greeting }: { firstName: string; greeting: string }) {
  return (
    <h1 className="portal-display mt-[13px] max-w-[700px] text-[clamp(42px,6.4vw,84px)] font-black uppercase leading-[.84] tracking-[-.09em] text-[#0A1F44] dark:text-[#f4f7fa] max-[700px]:text-[clamp(43px,13vw,65px)]">
      <span className="block whitespace-nowrap max-[700px]:whitespace-normal">{greeting},</span>
      <span className="block text-[#8dc63f]">{firstName}.</span>
    </h1>
  );
}

function KpiCell({
  label,
  children,
  note,
  loading,
}: {
  label: string;
  children: React.ReactNode;
  note: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="min-h-[86px] bg-[#0A1F44]/90 p-[13px_15px] dark:bg-[#0A1F44]/80">
      {loading ? (
        <>
          <Skeleton className="h-2.5 w-24 rounded-none bg-white/10" />
          <Skeleton className="mt-[13px] h-7 w-20 rounded-none bg-white/10" />
          <Skeleton className="mt-2 h-2.5 w-28 rounded-none bg-white/10" />
        </>
      ) : (
        <>
          <span className="block truncate text-[9px] font-black uppercase tracking-[.13em] text-[#9caabd]">
            {label}
          </span>
          <strong className="portal-num mt-[13px] flex items-baseline gap-[5px] text-[22px] font-black leading-none tracking-[-.07em] text-[#f4f7fa]">
            {children}
          </strong>
          <span className="mt-1 block text-[9px] text-[#9caabd]">{note}</span>
        </>
      )}
    </div>
  );
}

function QueueIcon({ icon }: { icon: QueueItem['icon'] }) {
  const className = 'h-4 w-4 shrink-0 text-[#8dc63f]';
  if (icon === 'review') return <ClipboardCheck className={className} aria-hidden="true" />;
  if (icon === 'invite') return <UserPlus className={className} aria-hidden="true" />;
  if (icon === 'calls') return <Phone className={className} aria-hidden="true" />;
  if (icon === 'onboard') return <BookOpenText className={className} aria-hidden="true" />;
  return <ShieldCheck className={className} aria-hidden="true" />;
}

function QueueSkeleton({ count }: { count: number }) {
  return (
    <div aria-label="Loading next actions">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="grid min-h-[78px] grid-cols-[42px_28px_minmax(0,1fr)_auto_17px] items-center gap-3 border-b border-[#0A1F44]/[.14] dark:border-white/[.08] max-[700px]:grid-cols-[29px_23px_minmax(0,1fr)_13px] max-[700px]:gap-[7px]"
        >
          <Skeleton className="grid size-[29px] place-items-center rounded-full bg-[#0A1F44]/10 dark:bg-white/10 max-[700px]:size-[26px]" />
          <Skeleton className="size-4 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
          <span className="min-w-0">
            <Skeleton className="h-3.5 w-40 max-w-full rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
            <Skeleton className="mt-1.5 h-2.5 w-28 max-w-full rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
          </span>
          <Skeleton className="h-5 w-16 rounded-full bg-[#0A1F44]/10 dark:bg-white/10 max-[700px]:col-start-3 max-[700px]:row-start-2" />
          <Skeleton className="size-4 rounded-none bg-[#0A1F44]/10 dark:bg-white/10 max-[700px]:col-start-4 max-[700px]:row-start-1" />
        </div>
      ))}
    </div>
  );
}

function QueueSection({
  items,
  managerView,
  loading,
}: {
  items: QueueItem[];
  managerView: boolean;
  loading: boolean;
}) {
  return (
    <section className="portal-enter portal-enter-2 mt-[29px]">
      <div className="flex items-end justify-between gap-[15px] border-b border-[#8dc63f] pb-[11px] max-[700px]:items-start">
        <div>
          <p className="font-mono text-[10px] font-extrabold uppercase tracking-[.18em] text-[#687384] dark:text-[#9caabd]">
            Priority ordered / next actions
          </p>
          <h2 className="mt-0.5 text-[22px] font-black uppercase leading-none tracking-[-.05em] text-[#0A1F44] dark:text-[#f4f7fa]">
            {managerView ? 'Needs your attention' : "What's next"}
          </h2>
        </div>
        <p className="text-right font-mono text-[9px] uppercase tracking-[.12em] text-[#687384] dark:text-[#9caabd] max-[700px]:max-w-[118px] max-[700px]:leading-[1.35]">
          {managerView ? 'Manager' : 'Rep'} view · {items.length} items
        </p>
      </div>

      {loading ? (
        <QueueSkeleton count={Math.max(items.length, managerView ? 3 : 1)} />
      ) : (
        items.map((item, index) => (
          <Link
            key={item.key}
            href={item.href}
            className={`group grid min-h-[78px] grid-cols-[42px_28px_minmax(0,1fr)_auto_17px] items-center gap-3 border-b border-[#0A1F44]/[.14] transition-colors duration-150 hover:bg-[#8dc63f]/[.07] dark:border-white/[.08] max-[700px]:grid-cols-[29px_23px_minmax(0,1fr)_13px] max-[700px]:gap-[7px] ${item.admin ? 'border-l-2 border-l-[#8dc63f] bg-[#8dc63f]/[.045] pl-3' : ''}`}
          >
            <span className="grid size-[29px] place-items-center rounded-full border border-[#8dc63f] font-mono text-[10px] font-black text-[#8dc63f] max-[700px]:size-[26px]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <QueueIcon icon={item.icon} />
            <span className="line-copy min-w-0">
              <span className="block text-[14px] font-black text-[#0A1F44] dark:text-[#f4f7fa] max-[700px]:text-[11px]">
                {item.title}
              </span>
              <span className="mt-1 block truncate font-mono text-[9px] text-[#687384] dark:text-[#9caabd] max-[700px]:text-[8px]">
                {item.meta}
              </span>
            </span>
            <span className={`rounded-full border border-[#0A1F44]/[.14] px-2 py-[5px] font-mono text-[9px] whitespace-nowrap text-[#687384] dark:border-white/[.14] dark:text-[#9caabd] max-[700px]:col-start-3 max-[700px]:row-start-2 max-[700px]:justify-self-start max-[700px]:px-1.5 max-[700px]:py-1 max-[700px]:text-[8px] ${item.admin ? 'border-[#8dc63f]/[.55] text-[#5a8f1f] dark:text-[#8dc63f]' : ''}`}>
              {item.tail}
            </span>
            <ChevronRight className="h-[15px] w-[15px] shrink-0 text-[#9caabd] transition-transform duration-150 group-hover:translate-x-0.5 max-[700px]:col-start-4 max-[700px]:row-start-1 max-[700px]:h-[13px] max-[700px]:w-[13px]" aria-hidden="true" />
          </Link>
        ))
      )}
    </section>
  );
}

function TickerSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-px border border-[#0A1F44]/[.14] bg-[#0A1F44]/[.14] dark:border-white/[.14] dark:bg-white/[.14] max-[430px]:grid-cols-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="min-w-0 bg-[#0A1F44]/70 p-[13px_12px] max-[700px]:p-3 max-[430px]:p-[12px_10px]">
          <Skeleton className="h-2.5 w-5 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
          <Skeleton className="mt-2.5 h-3 w-24 max-w-full rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
          <Skeleton className="mt-1 h-2.5 w-16 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function LeaderboardTicker({
  entries,
  currentUser,
  loading,
  userId,
}: {
  entries: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  loading: boolean;
  userId?: string;
}) {
  const tickerEntries = useMemo(() => {
    const topEntries = entries.slice(0, 5);
    if (currentUser && !topEntries.some((entry) => entry.salesRepId === currentUser.salesRepId)) {
      return [...entries.slice(0, 4), currentUser];
    }
    return topEntries;
  }, [currentUser, entries]);

  return (
    <section className="portal-enter portal-enter-3 mt-[29px]" aria-label="Monthly leaderboard">
      {loading ? (
        <TickerSkeleton />
      ) : tickerEntries.length === 0 ? (
        <div className="border border-[#0A1F44]/[.14] bg-[#0A1F44]/70 px-3 py-6 text-center font-mono text-[9px] text-[#9caabd] dark:border-white/[.14]">
          No points on the board yet this month — first sale takes #1.
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-px border border-[#0A1F44]/[.14] bg-[#0A1F44]/[.14] dark:border-white/[.14] dark:bg-white/[.14] max-[430px]:grid-cols-2">
          {tickerEntries.map((entry) => {
            const mine = entry.salesRepId === userId;
            return (
              <div
                key={entry.salesRepId}
                className={`min-w-0 bg-[#0A1F44]/70 p-[13px_12px] max-[700px]:p-3 max-[430px]:p-[12px_10px] ${mine ? 'bg-[#8dc63f] text-[#0A1F44]' : ''}`}
              >
                <span className={`block font-mono text-[9px] font-black ${mine ? 'text-[#0A1F44]/[.65]' : 'text-[#9caabd]'}`}>
                  {String(entry.rank).padStart(2, '0')}
                </span>
                <strong className="mt-[9px] block truncate text-[11px] font-black max-[430px]:whitespace-normal max-[430px]:leading-[1.25]">
                  {entry.salesRepName}
                  {mine && <em className="ml-1 bg-[#0A1F44] px-1 py-0.5 font-mono text-[7px] not-italic uppercase tracking-[.08em] text-white">You</em>}
                </strong>
                <span className={`mt-1 block font-mono text-[10px] ${mine ? 'text-[#0A1F44]/[.72]' : 'text-[#9caabd]'}`}>
                  {formatNumber(entry.totalPoints)} pts
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { user, hasPermission, isRole } = useAuth();
  const { resolvedTheme } = useTheme();
  const effectiveRole = getEffectiveRole(user);
  const roleLabel = effectiveRole ? RoleDisplayNames[effectiveRole] : 'Team Member';
  const canManageRecruiting = isRole(
    'admin',
    'operations',
    'l1_manager',
    'l2_manager',
    'ibo_level_1',
    'ibo_level_2',
    'ibo_level_3',
    'ibo_level_4'
  );
  const leadsWithQueue = hasPermission('sales:approve') || isRole('admin', 'operations');
  const isAdmin = isRole('admin');
  const pendingSignups = usePendingSignupsCount(isAdmin);

  const [stats, setStats] = useState<SalesStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(null);
  const [totalRanked, setTotalRanked] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [timeContext, setTimeContext] = useState<TimeContext>(initialTimeContext);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function fetchDashboardData() {
      if (!user) {
        setStatsLoading(false);
        setLeaderboardLoading(false);
        return;
      }

      setStatsLoading(true);
      setLeaderboardLoading(true);

      try {
        const statsRes = await fetch(
          `/api/portal/sales/stats?${hasPermission('sales:approve') ? '' : `salesRepId=${user.uid}&`}period=month&requestedBy=${user.uid}`,
          { signal: controller.signal }
        );
        if (statsRes.ok) {
          const data = await statsRes.json();
          if (mounted) setStats(data.stats);
        }

        const token = await auth?.currentUser?.getIdToken();
        const leaderboardRes = await fetch(
          '/api/portal/leaderboard?period=month&metric=totalPoints&limit=100',
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            signal: controller.signal,
          }
        );
        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          if (mounted) {
            setLeaderboard(data.leaderboard ?? []);
            setCurrentUser(data.currentUser ?? null);
            setTotalRanked(data.totalRanked ?? 0);
          }
        }
      } catch (error) {
        if (!mounted || isAbortError(error, controller.signal)) return;
        console.error('Error fetching dashboard data:', error);
      } finally {
        if (mounted && !controller.signal.aborted) {
          setStatsLoading(false);
          setLeaderboardLoading(false);
        }
      }
    }

    void fetchDashboardData();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [hasPermission, user]);

  useEffect(() => {
    setTimeContext(getTimeContext());
    setMounted(true);
  }, []);

  const firstName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const { greeting, dateLabel, weekdayLabel, refreshedLabel } = mounted ? timeContext : initialTimeContext;
  const approvedPoints = stats?.approvedPoints ?? 0;
  const pendingCount = stats?.pendingCount ?? 0;
  const rank = currentUser?.rank ?? null;
  const rankPoints = currentUser?.totalPoints ?? 0;
  const pointsChange = stats?.pointsChange ?? 0;
  const changeLabel = pointsChange === 0
    ? 'No change vs last month'
    : `${pointsChange > 0 ? '+' : ''}${Number.isInteger(pointsChange) ? pointsChange : pointsChange.toFixed(1)}% vs last month`;

  const contextCopy = leadsWithQueue
    ? pendingSignups > 0
      ? `${pendingSignups} new signup${pendingSignups === 1 ? '' : 's'} need role assignment. ${pendingCount > 0 ? 'Clear the oldest approval, then ' : ''}make today's call block count.`
      : pendingCount > 0
        ? `${pendingCount} approval${pendingCount === 1 ? '' : 's'} are in flight. Clear the oldest, then make today's call block count.`
        : "Your queue is clear. Make today's call block count."
    : pendingCount > 0
      ? `${pendingCount} approval${pendingCount === 1 ? '' : 's'} are in flight. Start with the oldest, then make today's call block count.`
      : "Your numbers are clear. Make today's call block count.";

  const queueItems = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];
    if (leadsWithQueue) {
      items.push({
        key: 'review',
        title: `Review pending sales (${pendingCount})`,
        meta: `${pendingCount} submission${pendingCount === 1 ? '' : 's'} · oldest needs review`,
        tail: pendingCount > 0 ? 'URGENT' : 'REVIEW',
        href: '/portal/sales?status=pending',
        icon: 'review',
      });
      if (isAdmin && pendingSignups > 0) {
        items.push({
          key: 'assign',
          title: `${pendingSignups} signup${pendingSignups === 1 ? '' : 's'} awaiting role assignment`,
          meta: 'Admin queue · role-less accounts',
          tail: 'ADMIN',
          href: '/portal/admin/users',
          icon: 'assign',
          admin: true,
        });
      }
    }

    items.push({
      key: 'calls',
      title: "Open today's calls",
      meta: 'Current schedule · join links ready',
      tail: 'CALLS',
      href: '/portal/calls',
      icon: 'calls',
    });

    if (!leadsWithQueue && isRole('entry_level_rep')) {
      items.splice(1, 0, {
        key: 'onboard',
        title: 'Continue onboarding',
        meta: 'Required steps · compliance',
        tail: 'RESUME',
        href: '/portal/onboarding',
        icon: 'onboard',
      });
    }

    if (canManageRecruiting) {
      items.push({
        key: 'invite',
        title: 'Send recruit invite',
        meta: 'Create a website onboarding link',
        tail: 'RECRUITING',
        href: '/portal/admin/recruiting',
        icon: 'invite',
      });
    }

    return items;
  }, [canManageRecruiting, isAdmin, isRole, leadsWithQueue, pendingCount, pendingSignups]);

  const commandBlock = (
    <header className={`portal-enter ${leadsWithQueue ? 'portal-enter-3 border-[#8dc63f]/40' : 'portal-enter border-[#0A1F44]/[.14] dark:border-white/[.14]'} border-b py-[43px] pb-6`}>
      <div className="flex items-end justify-between gap-[30px] max-[700px]:block">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-extrabold uppercase tracking-[.18em] text-[#687384] dark:text-[#9caabd]">
            {leadsWithQueue ? 'Management' : 'Field sales'} / broadcast
          </p>
          <Greeting firstName={firstName} greeting={greeting} />
          <p className="mt-[11px] max-w-[580px] text-[14px] leading-[1.45] text-[#687384] dark:text-[#9caabd] max-[700px]:text-[13px]">
            {contextCopy}
          </p>
          <Link
            href="/portal/calls"
            className="mt-[18px] inline-flex items-center gap-2 rounded-full border border-[#8dc63f] px-3 py-[9px] font-mono text-[10px] font-black uppercase tracking-[.13em] text-[#5a8f1f] transition-colors duration-150 hover:bg-[#8dc63f] hover:text-[#0A1F44] dark:text-[#8dc63f] dark:hover:text-[#0A1F44]"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            Open today&apos;s calls
          </Link>
        </div>
        <div className="min-w-0 shrink-0 basis-[40%] text-right max-[700px]:mt-[29px] max-[700px]:basis-auto max-[700px]:text-left" style={{ containerType: 'inline-size' }}>
          {statsLoading ? (
            <Skeleton className="h-[88px] w-56 max-w-full rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
          ) : (
            <strong className="portal-display portal-metallic-num block max-w-full whitespace-nowrap text-[clamp(48px,28cqw,118px)] font-black leading-[.86] tracking-[-.11em] max-[700px]:text-[clamp(64px,23vw,92px)]" style={resolvedTheme === 'dark' ? darkMetallicNumberStyle : lightMetallicNumberStyle}>
              <CountUpNumber value={approvedPoints} />
            </strong>
          )}
          <small className="mt-4 block font-mono text-[10px] uppercase leading-[1.3] tracking-[.12em] text-[#687384] dark:text-[#9caabd]">
            Approved points · rank {rank ? `#${rank} of ${totalRanked || '—'}` : 'unranked'}
          </small>
        </div>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-px border border-[#0A1F44]/[.14] bg-[#0A1F44]/[.14] dark:border-white/[.14] dark:bg-white/[.14] lg:grid-cols-4">
        <KpiCell label="Approved points" loading={statsLoading} note={pointsChange === 0 ? changeLabel : <><span className="text-[#8dc63f]">{changeLabel.split(' vs')[0]}</span>{changeLabel.includes(' vs') ? ` vs${changeLabel.split(' vs')[1]}` : ''}</>}>
          <CountUpNumber value={approvedPoints} />
          <small className="font-sans text-[8px] tracking-[.1em] text-[#9caabd]">PTS</small>
        </KpiCell>
        <KpiCell label="Sales this month" loading={statsLoading} note={`${stats?.approvedCount ?? 0} approved / ${stats?.rejectedCount ?? 0} rejected`}>
          <CountUpNumber value={stats?.totalSales ?? 0} />
          <small className="font-sans text-[8px] tracking-[.1em] text-[#9caabd]">SALES</small>
        </KpiCell>
        <KpiCell label="Pending approvals" loading={statsLoading} note={pendingCount > 0 ? 'Awaiting manager review' : 'No pending sales'}>
          <CountUpNumber value={pendingCount} />
          <small className="font-sans text-[8px] tracking-[.1em] text-[#9caabd]">OPEN</small>
        </KpiCell>
        <KpiCell label="Leaderboard rank" loading={leaderboardLoading} note={rank && rank <= 10 ? <><span className="text-[#8dc63f]">Top 10</span> · {formatNumber(rankPoints)} pts</> : `${formatNumber(rankPoints)} pts this month`}>
          <span>#</span>
          {rank !== null ? formatNumber(rank) : '—'}
          <small className="font-sans text-[8px] tracking-[.1em] text-[#9caabd]">{totalRanked ? `OF ${totalRanked}` : 'RANK'}</small>
        </KpiCell>
      </dl>
    </header>
  );

  const masthead = (
    <header className="portal-enter flex items-center justify-between border-b border-[#8dc63f] pb-[13px] pt-[5px]">
      <span className="text-[11px] font-black uppercase tracking-[.2em] text-[#0A1F44] dark:text-[#f4f7fa] max-[430px]:text-[10px]">
        <span className="mr-2 inline-block size-[11px] align-[-1px] bg-[#8dc63f] shadow-[0_0_18px_rgba(141,198,63,.35)]" aria-hidden="true" />
        3C World Group / The Line
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[.13em] text-[#687384] dark:text-[#9caabd] max-[430px]:hidden">
        {dateLabel} · {weekdayLabel}
      </span>
    </header>
  );

  return (
    <div className="relative -m-4 min-h-[calc(100vh-4rem)] overflow-hidden bg-[#f7f8f5] text-[#0A1F44] sm:-m-6 dark:bg-[#030916] dark:text-[#f4f7fa]">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(10,31,68,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(10,31,68,.03)_1px,transparent_1px)] [background-size:56px_56px] dark:hidden" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 hidden opacity-[.23] dark:block"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(141,198,63,.09), transparent 24%), radial-gradient(circle at 20% 54%, rgba(21,60,116,.16), transparent 35%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 100% 100%, 56px 56px, 56px 56px',
          maskImage: 'linear-gradient(to bottom, black, transparent 78%)',
        }}
        aria-hidden="true"
      />
      <div aria-label={`${roleLabel} dashboard`} className="relative z-10 mx-auto w-full max-w-[1180px] px-[clamp(14px,4vw,58px)] pb-[42px] pt-[19px] max-[430px]:px-3">
        {masthead}
        <div className="flex flex-col">
          {leadsWithQueue ? (
            <>
              <QueueSection items={queueItems} managerView loading={statsLoading} />
              {commandBlock}
            </>
          ) : (
            <>
              {commandBlock}
              <QueueSection items={queueItems} managerView={false} loading={statsLoading} />
            </>
          )}
          <LeaderboardTicker entries={leaderboard} currentUser={currentUser} loading={leaderboardLoading} userId={user?.uid} />
        </div>
        <footer className="portal-enter portal-enter-4 mt-[25px] flex justify-between gap-3 border-t border-[#0A1F44]/[.14] pt-[13px] font-mono text-[9px] leading-[1.7] text-[#687384] dark:border-white/[.14] dark:text-[#9caabd] max-[700px]:block">
          <span>Monthly leaderboard · approved points only.</span>
          <span className="max-[700px]:block">Last refreshed {refreshedLabel} · <Link href="/portal/leaderboard" className="hover:text-[#5a8f1f] dark:hover:text-[#8dc63f]">View all standings <ArrowRight className="ml-0.5 inline h-3 w-3" aria-hidden="true" /></Link></span>
        </footer>
      </div>
    </div>
  );
}
