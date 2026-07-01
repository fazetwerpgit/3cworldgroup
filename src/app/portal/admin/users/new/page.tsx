'use client';

import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserForm } from '@/components/admin/UserForm';
import { Button } from '@/components/ui/button';

export default function NewUserPage() {
  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="mx-auto max-w-[1100px] space-y-5">
        <Button asChild variant="ghost" className="text-slate-600 dark:text-muted-foreground hover:text-slate-950 dark:text-foreground">
          <Link href="/portal/admin/users">
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </Link>
        </Button>

        <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#8dc63f]/15 text-[#4f7f1e]">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                Add New User
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
                Create a portal account with the right employee role, reporting
                assignment, and access status.
              </p>
            </div>
          </div>
        </section>

        <UserForm />
      </div>
    </ProtectedRoute>
  );
}
