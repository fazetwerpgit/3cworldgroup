'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Plus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserTable } from '@/components/admin/UserTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { User, UserRole, RoleDisplayNames } from '@/types';

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | ''>('');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!currentUser) return;
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);
      params.append('requestedBy', currentUser.uid);

      const response = await fetch(`/api/portal/auth/users?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch users');
      }

      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter, currentUser]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleStatusChange = async (
    userId: string,
    status: 'active' | 'inactive'
  ) => {
    try {
      const response = await fetch(`/api/portal/auth/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, requestedBy: currentUser?.uid }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteClick = (userId: string, userName: string) => {
    setDeleteConfirm({ userId, userName });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    setError('');

    try {
      const response = await fetch(
        `/api/portal/auth/users/${deleteConfirm.userId}?requestedBy=${currentUser?.uid ?? ''}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      fetchUsers();
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              User Management
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Manage employee accounts, roles, and access status.
            </p>
          </div>
          <Button asChild className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
            <Link href="/portal/admin/users/new">
              <Plus className="h-4 w-4" />
              Add User
            </Link>
          </Button>
          </div>
        </section>

        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">Role</label>
                <NativeSelect
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
                  className="w-48"
                >
                  <NativeSelectOption value="">All Roles</NativeSelectOption>
                  {(Object.entries(RoleDisplayNames) as [UserRole, string][]).map(
                    ([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    )
                  )}
                </NativeSelect>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">Status</label>
                <NativeSelect
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'active' | 'inactive' | '')
                  }
                  className="w-36"
                >
                  <NativeSelectOption value="">All</NativeSelectOption>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                </NativeSelect>
              </div>
              {(roleFilter || statusFilter) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-slate-600 hover:text-slate-950"
                  onClick={() => {
                    setRoleFilter('');
                    setStatusFilter('');
                  }}
                >
                  Clear filters
                </Button>
              )}
              <span className="ml-auto text-sm text-slate-500">
                {users.length} user{users.length !== 1 ? 's' : ''} found
              </span>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <Card className="rounded-lg border-slate-200 bg-white text-center shadow-sm">
            <CardContent className="py-8">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
              <p className="mt-4 text-sm text-slate-500">Loading users...</p>
            </CardContent>
          </Card>
        ) : (
          <UserTable
            users={users}
            onStatusChange={handleStatusChange}
            onDelete={handleDeleteClick}
            loading={loading || deleting}
          />
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md rounded-lg border-slate-200 bg-white py-0 shadow-xl">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-red-50 p-2 text-red-600">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950">Delete User</h3>
                </div>
                <p className="mb-6 text-sm text-slate-600">
                  Permanently delete <strong>{deleteConfirm.userName}</strong> from
                  the system. This action cannot be undone.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {deleting ? 'Deleting...' : 'Delete User'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
