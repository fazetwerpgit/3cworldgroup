'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, CheckCircle2, GraduationCap, PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  permissions?: string[];
}

const actions: QuickAction[] = [
  {
    title: 'Log New Sale',
    description: 'Record customer and plan details.',
    href: '/portal/sales/new',
    icon: <PlusCircle className="h-5 w-5" />,
    permissions: ['sales:write'],
  },
  {
    title: 'Training Library',
    description: 'Review modules and required resources.',
    href: '/portal/training',
    icon: <GraduationCap className="h-5 w-5" />,
    permissions: ['training:read'],
  },
  {
    title: 'Leaderboard',
    description: 'Compare monthly performance.',
    href: '/portal/leaderboard',
    icon: <BarChart3 className="h-5 w-5" />,
    permissions: ['leaderboard:read'],
  },
  {
    title: 'Approve Sales',
    description: 'Review team submissions.',
    href: '/portal/approvals',
    icon: <CheckCircle2 className="h-5 w-5" />,
    permissions: ['sales:approve'],
  },
];

export function QuickActions() {
  const { hasPermission } = useAuth();

  const visibleActions = actions.filter((action) => {
    if (!action.permissions || action.permissions.length === 0) return true;
    return action.permissions.some((p) => hasPermission(p));
  });

  if (visibleActions.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-950 dark:text-foreground">Quick Actions</h2>
        <p className="text-xs text-slate-500 dark:text-muted-foreground">Common portal workflows</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {visibleActions.map((action) => (
          <Link key={action.title} href={action.href} className="group">
            <Card className="h-full border-slate-200 shadow-sm transition-colors duration-200 group-hover:border-[#8dc63f] group-hover:bg-[#8dc63f]/5 dark:border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0A1F44]/5 text-[#0A1F44] dark:bg-muted dark:text-foreground">
                    {action.icon}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#5a8f1f] dark:text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-950 dark:text-foreground">{action.title}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">{action.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
