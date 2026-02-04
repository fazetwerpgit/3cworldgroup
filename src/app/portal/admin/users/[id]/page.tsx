'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { UserForm } from '@/components/admin/UserForm';
import { User } from '@/types';

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
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
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-3xl mx-auto">
              {/* Back link */}
              <Link
                href="/portal/admin/users"
                className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Users
              </Link>

              {/* Loading */}
              {loading && (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading user...</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Form */}
              {user && (
                <>
                  <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[#0A1F44]">Edit User</h1>
                    <p className="text-gray-500 mt-1">
                      Update {user.displayName}&apos;s account information and permissions.
                    </p>
                  </div>
                  <UserForm user={user} isEdit />
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
