'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardStats } from '@/components/portal/DashboardStats';
import { MiniLeaderboard } from '@/components/portal/MiniLeaderboard';
import { PendingSignupsBanner } from '@/components/portal/PendingSignupsBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

export default function DashboardPage() {
  const { user, hasPermission, isRole } = useAuth();
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

  // Managers, ops, and admins open on the work waiting for them; reps open on
  // their own numbers (client decision, ANCHOR.md §9).
  const leadsWithQueue = hasPermission('sales:approve') || isRole('admin', 'operations');

  const firstName =
    user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const actionItems = [
    {
      title: 'Review pending sales',
      description: 'Work through submitted sales that need manager action.',
      href: '/portal/approvals',
      show: hasPermission('sales:approve'),
      tone: 'warning',
    },
    {
      title: 'Send recruit invite',
      description: 'Create a website onboarding link for a selected recruit.',
      href: '/portal/admin/recruiting',
      show: canManageRecruiting,
      tone: 'primary',
    },
    {
      title: 'Continue onboarding',
      description: 'Finish required documents and role-specific steps.',
      href: '/portal/onboarding',
      show: isRole('entry_level_rep'),
      tone: 'neutral',
    },
    {
      title: 'Open today’s calls',
      description: 'Check the current call schedule and join links.',
      href: '/portal/calls',
      show: true,
      tone: 'neutral',
    },
  ].filter((item) => item.show);

  const actionQueue = (
    <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
      <CardHeader className="border-b border-slate-100 !py-3 dark:border-border">
        <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-foreground">
          <ListChecks className="h-4 w-4 text-[#5a8f1f]" />
          {leadsWithQueue ? 'Needs your attention' : 'Today’s actions'}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-slate-100 px-0 text-sm dark:divide-border">
        {actionItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-muted"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                item.tone === 'primary'
                  ? 'bg-[#8dc63f]/15 text-[#5a8f1f]'
                  : item.tone === 'warning'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground'
              }`}
            >
              {item.tone === 'warning' ? (
                <ClipboardCheck className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-950 dark:text-foreground">
                {item.title}
              </span>
              <span className="block truncate text-slate-500 dark:text-muted-foreground">
                {item.description}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#5a8f1f] dark:text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );

  const workGrid = (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="portal-enter portal-enter-2 xl:col-span-7">{actionQueue}</div>
      <div className="portal-enter portal-enter-3 xl:col-span-5">
        <MiniLeaderboard />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {/* Command band: the workspace carries the same navy + seam identity as
          the login deck. */}
      <section className="portal-enter relative overflow-hidden rounded-lg bg-[#0A1F44] text-white dark:bg-[#0e2647] dark:ring-1 dark:ring-inset dark:ring-white/15">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 45% 90% at 8% 100%, rgba(141,198,63,0.16), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 28px 28px, 28px 28px',
          }}
        />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
              {today} · {roleLabel}
            </p>
            <h1 className="portal-display mt-1.5 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Hey {firstName}.
            </h1>
            <p className="mt-1.5 text-sm text-white/60">
              {leadsWithQueue ? 'Here’s what’s waiting on you.' : 'Here’s where you stand.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <Link href="/portal/calls">
                <CalendarDays className="h-4 w-4" />
                Calls
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <PendingSignupsBanner />

      {leadsWithQueue ? (
        <>
          {workGrid}
          <div className="portal-enter portal-enter-4">
            <DashboardStats />
          </div>
        </>
      ) : (
        <>
          <div className="portal-enter portal-enter-2">
            <DashboardStats />
          </div>
          {workGrid}
        </>
      )}
    </div>
  );
}
