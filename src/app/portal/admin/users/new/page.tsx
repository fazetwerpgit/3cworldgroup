'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { UserForm } from '@/components/admin/UserForm';
import { Button } from '@/components/ui/button';

export default function NewUserPage() {
  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="mx-auto max-w-[1100px] space-y-5">
        <Button asChild variant="ghost" className="text-slate-600 dark:text-muted-foreground hover:text-slate-950 dark:hover:text-foreground">
          <Link href="/portal/admin/users">
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </Link>
        </Button>

        <PortalPageHeader
          compact
          eyebrow="Administration"
          title="Add New User"
          description="Create a portal account with the right employee role, reporting assignment, and access status."
        />

        <div className="portal-enter portal-enter-2">
          <UserForm />
        </div>
      </div>
    </ProtectedRoute>
  );
}
