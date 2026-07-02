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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

export default function DashboardPage() {
  const { user, hasPermission, isRole } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const roleLabel = effectiveRole ? RoleDisplayNames[effectiveRole] : 'Team Member';
  const canManageRecruiting = isRole('admin', 'operations', 'l1_manager', 'l2_manager');

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
      title: 'Log a new sale',
      description: 'Submit customer and plan details for review.',
      href: '/portal/sales/new',
      show: hasPermission('sales:write'),
      tone: 'primary',
    },
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
      show: isRole('entry_rep', 'l1_manager', 'l2_manager'),
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
      <div className="xl:col-span-7">{actionQueue}</div>
      <div className="xl:col-span-5">
        <MiniLeaderboard />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                Hey {firstName}
              </h1>
              <Badge variant="secondary" className="rounded-md">
                {roleLabel}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
              {today} —{' '}
              {leadsWithQueue
                ? 'here’s what’s waiting on you.'
                : 'here’s where you stand.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              className="border-slate-200 bg-white dark:border-border dark:bg-card"
            >
              <Link href="/portal/calls">
                <CalendarDays className="h-4 w-4" />
                Calls
              </Link>
            </Button>
            {hasPermission('sales:write') && (
              <Button asChild className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                <Link href="/portal/sales/new">
                  Log sale
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {leadsWithQueue ? (
        <>
          {workGrid}
          <DashboardStats />
        </>
      ) : (
        <>
          <DashboardStats />
          {workGrid}
        </>
      )}
    </div>
  );
}
