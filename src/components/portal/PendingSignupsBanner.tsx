'use client';

import Link from 'next/link';
import { ArrowRight, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { Card, CardContent } from '@/components/ui/card';

// Pure so it's cheap to unit test independent of the Firestore listener.
export function pendingSignupsLabel(count: number): string {
  return `${count} signup${count === 1 ? '' : 's'} awaiting approval`;
}

/**
 * Admin-only dashboard banner surfacing self-signups stuck in 'pending'.
 * Renders nothing for non-admins or once the queue is empty.
 */
export function PendingSignupsBanner() {
  const { isRole } = useAuth();
  const isAdmin = isRole('admin');
  const count = usePendingSignupsCount(isAdmin);

  if (!isAdmin || count === 0) return null;

  return (
    <Card className="portal-enter rounded-lg border-amber-200 bg-amber-50 py-0 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
      <CardContent className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            <UserPlus className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {pendingSignupsLabel(count)}
          </p>
        </div>
        <Link
          href="/portal/admin/users"
          className="group inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100"
        >
          Review
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
