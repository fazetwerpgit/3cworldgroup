'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Link2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardStats } from '@/components/portal/DashboardStats';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

export default function DashboardPage() {
  const { user, hasPermission, isRole } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const roleLabel = effectiveRole ? RoleDisplayNames[effectiveRole] : 'Team Member';
  const canManageRecruiting = isRole('admin', 'operations', 'l1_manager', 'l2_manager');

  const actionItems = [
    {
      title: 'Log a new sale',
      description: 'Submit customer and plan details for review.',
      href: '/portal/sales/new',
      icon: <ArrowRight className="h-4 w-4" />,
      show: hasPermission('sales:write'),
      tone: 'primary',
    },
    {
      title: 'Review pending sales',
      description: 'Work through submitted sales that need manager action.',
      href: '/portal/approvals',
      icon: <ClipboardCheck className="h-4 w-4" />,
      show: hasPermission('sales:approve'),
      tone: 'warning',
    },
    {
      title: 'Send recruit invite',
      description: 'Create a website onboarding link for a selected recruit.',
      href: '/portal/admin/recruiting',
      icon: <ArrowRight className="h-4 w-4" />,
      show: canManageRecruiting,
      tone: 'primary',
    },
    {
      title: 'Continue onboarding',
      description: 'Finish required documents and role-specific steps.',
      href: '/portal/onboarding',
      icon: <ArrowRight className="h-4 w-4" />,
      show: isRole('entry_rep', 'l1_manager', 'l2_manager'),
      tone: 'neutral',
    },
    {
      title: 'Open today’s calls',
      description: 'Check the current call schedule and join links.',
      href: '/portal/calls',
      icon: <CalendarDays className="h-4 w-4" />,
      show: true,
      tone: 'neutral',
    },
  ].filter((item) => item.show);

  const signalItems = [
    {
      title: 'Team Chat',
      description: 'Coordinate with the team without using it as policy storage.',
      href: '/portal/chat',
      icon: <MessageSquareText className="h-4 w-4" />,
      show: hasPermission('chat:read'),
    },
    {
      title: 'University',
      description: 'Training modules, shorts, and manager enablement.',
      href: '/portal/training',
      icon: <GraduationCap className="h-4 w-4" />,
      show: hasPermission('training:read'),
    },
    {
      title: 'Field Links',
      description: 'Pinned resources for repeated field workflows.',
      href: '/portal/links',
      icon: <Link2 className="h-4 w-4" />,
      show: hasPermission('links:read'),
    },
  ].filter((item) => item.show);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                Today
              </h1>
              <Badge variant="secondary" className="rounded-md">
                {roleLabel}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
              Start with the work that moves sales, onboarding, calls, and manager review
              forward.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="border-slate-200 bg-white dark:border-border dark:bg-card">
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

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto]">
        <div className="portal-panel rounded-lg px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-2 font-semibold text-slate-950 dark:text-foreground">
              <Activity className="size-4 text-[#5a8f1f]" />
              Operating strip
            </span>
            <span className="text-slate-500 dark:text-muted-foreground">
              The portal stays focused on current workflows: sales, onboarding, calls,
              chat, training, approvals, and recruiting.
            </span>
          </div>
        </div>
        {hasPermission('chat:read') && (
          <Button asChild variant="outline" className="border-slate-200 bg-white dark:border-border dark:bg-card">
          <Link href="/portal/chat">
            <MessageSquareText className="size-4" />
            Open Team Chat
          </Link>
          </Button>
        )}
      </section>

      <DashboardStats />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card xl:col-span-7">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-foreground">
              <ClipboardCheck className="h-4 w-4 text-[#5a8f1f]" />
              Action Queue
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
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-950 dark:text-foreground">{item.title}</span>
                  <span className="block truncate text-slate-500 dark:text-muted-foreground">{item.description}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#5a8f1f] dark:text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card xl:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-foreground">
              <Sparkles className="h-4 w-4 text-[#5a8f1f]" />
              Team Signal
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {signalItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-md border border-slate-200 p-3 transition-colors hover:border-[#8dc63f] hover:bg-[#8dc63f]/5 dark:border-border"
              >
                <div className="flex items-center gap-2 font-semibold text-slate-950 dark:text-foreground">
                  <span className="text-[#5a8f1f]">{item.icon}</span>
                  {item.title}
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-muted-foreground">{item.description}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-foreground">
              <ShieldCheck className="h-4 w-4 text-[#5a8f1f]" />
              Operating Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600 dark:text-muted-foreground">
            Keep customer details accurate, submit only verified sales, and use the website
            onboarding flow when a recruit is ready so the handoff is not lost in email.
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-foreground">
              <FileText className="h-4 w-4 text-[#5a8f1f]" />
              Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Link href="/portal/pay-structure" className="rounded-md border border-slate-200 px-3 py-2 transition-colors hover:border-[#8dc63f] hover:bg-[#8dc63f]/5 dark:border-border">
              Pay structure
            </Link>
            <Link href="/portal/leaderboard" className="rounded-md border border-slate-200 px-3 py-2 transition-colors hover:border-[#8dc63f] hover:bg-[#8dc63f]/5 dark:border-border">
              Leaderboard
            </Link>
            <Link href="/portal/shorts" className="rounded-md border border-slate-200 px-3 py-2 transition-colors hover:border-[#8dc63f] hover:bg-[#8dc63f]/5 dark:border-border">
              Shorts
            </Link>
            <Link href="/portal/links" className="rounded-md border border-slate-200 px-3 py-2 transition-colors hover:border-[#8dc63f] hover:bg-[#8dc63f]/5 dark:border-border">
              Links
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
