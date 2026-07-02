'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { UserForm } from '@/components/admin/UserForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { User } from '@/types';

export default function EditUserPage() {
  const params = useParams();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sensitive, setSensitive] = useState<{ ssnLast4: string | null; dlLast4: string | null } | null>(null);
  const [revealed, setRevealed] = useState<{ ssn: string | null; dlNumber: string | null } | null>(null);

  const userId = params.id as string;

  useEffect(() => {
    async function fetchUser() {
      if (!currentUser) return;
      try {
        const response = await fetch(
          `/api/portal/auth/users/${userId}?requestedBy=${currentUser.uid}`
        );
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
  }, [userId, currentUser]);

  // Fetch the masked last-4 (admin only). Sends a REAL Firebase ID token, not a
  // UID — the server verifies it before returning anything.
  useEffect(() => {
    if (currentUser?.role !== 'admin' || !userId) return;
    let active = true;
    (async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch(`/api/portal/admin/sensitive/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (active) setSensitive({ ssnLast4: d.ssnLast4, dlLast4: d.dlLast4 });
    })().catch(() => {
      if (active) setSensitive(null);
    });
    return () => {
      active = false;
    };
  }, [currentUser, userId]);

  const doReveal = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const r = await fetch(`/api/portal/admin/sensitive/${userId}?reveal=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    setRevealed({ ssn: d.ssn, dlNumber: d.dlNumber });
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="mx-auto max-w-[1100px] space-y-5">
        <Button asChild variant="ghost" className="text-slate-600 dark:text-muted-foreground hover:text-slate-950 dark:hover:text-foreground">
          <Link href="/portal/admin/users">
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </Link>
        </Button>

        {loading && (
          <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 text-center shadow-sm">
            <CardContent className="py-8">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
              <p className="mt-4 text-sm text-slate-500 dark:text-muted-foreground">Loading user...</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-border bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {user && (
          <>
            <PortalPageHeader
              compact
              eyebrow="Administration"
              title="Edit User"
              description={`Update ${user.displayName}'s account information, permissions, and reporting assignment.`}
            />
            <div className="portal-enter portal-enter-2">
              <UserForm user={user} isEdit />
              {currentUser?.role === 'admin' && sensitive && (sensitive.ssnLast4 || sensitive.dlLast4) && (
                <section className="rounded-lg border border-amber-200 dark:border-border bg-amber-50 dark:bg-amber-500/15 p-5">
                  <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-300">Sensitive (admin only)</h2>
                  <p className="mt-2 text-sm text-slate-700 dark:text-muted-foreground">
                    SSN: {revealed?.ssn ?? (sensitive.ssnLast4 ? `•••••${sensitive.ssnLast4}` : '—')}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-muted-foreground">
                    DL #: {revealed?.dlNumber ?? (sensitive.dlLast4 ? `•••••${sensitive.dlLast4}` : '—')}
                  </p>
                  {!revealed && (
                    <button
                      onClick={doReveal}
                      className="mt-3 rounded-md border border-amber-300 dark:border-amber-500/30 px-3 py-1 text-sm font-medium text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                    >
                      Reveal
                    </button>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
