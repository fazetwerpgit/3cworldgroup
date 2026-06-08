'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserForm } from '@/components/admin/UserForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { User } from '@/types';

export default function EditUserPage() {
  const params = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const userId = params.id as string;

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch(`/api/portal/auth/users/${userId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch user');
        }

        setUser(data.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user');
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchUser();
    }
  }, [userId]);

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="mx-auto max-w-[1100px] space-y-5">
        <Button asChild variant="ghost" className="text-slate-600 hover:text-slate-950">
          <Link href="/portal/admin/users">
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </Link>
        </Button>

        {loading && (
          <Card className="rounded-lg border-slate-200 bg-white text-center shadow-sm">
            <CardContent className="py-8">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
              <p className="mt-4 text-sm text-slate-500">Loading user...</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {user && (
          <>
            <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#8dc63f]/15 text-[#4f7f1e]">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Edit User
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">
                    Update {user.displayName}&apos;s account information,
                    permissions, and reporting assignment.
                  </p>
                </div>
              </div>
            </section>
            <UserForm user={user} isEdit />
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
