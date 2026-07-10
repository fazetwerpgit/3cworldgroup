'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Plus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { UserTable } from '@/components/admin/UserTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { FieldRole, FieldRoles, User, UserRole, RoleDisplayNames } from '@/types';

const FIELD_ROLE_OPTIONS = Object.values(FieldRoles) as FieldRole[];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'pending' | ''>('');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [acceptConfirm, setAcceptConfirm] = useState<{
    userId: string;
    userName: string;
    fieldRole: FieldRole;
  } | null>(null);
  const [approveFieldRole, setApproveFieldRole] = useState<FieldRole>('entry_level_rep');
  const [approving, setApproving] = useState(false);
  const [accepting, setAccepting] = useState(false);
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

  const handleApproveClick = (userId: string) => {
    const target = users.find((u) => u.uid === userId);
    if (target?.fieldRole) {
      setError('This user already has a role assigned and is waiting for onboarding completion.');
      return;
    }

    setApproveFieldRole('entry_level_rep');
    setApproveConfirm({
      userId,
      userName: target?.displayName || target?.email || 'this user',
    });
  };

  const handleAcceptClick = (userId: string) => {
    const target = users.find((u) => u.uid === userId);
    if (!target?.fieldRole || target.status !== 'pending') {
      setError('This user is not a pending user with an assigned role.');
      return;
    }

    setAcceptConfirm({
      userId,
      userName: target.displayName || target.email || 'this user',
      fieldRole: target.fieldRole,
    });
  };

  const handleAcceptConfirm = async () => {
    if (!acceptConfirm) return;

    setAccepting(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${acceptConfirm.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          requestedBy: currentUser?.uid,
          ...(acceptConfirm.fieldRole === 'entry_level_rep' ? { fieldRole: 'entry_rep' } : {}),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept user');
      }

      await fetchUsers();
      setAcceptConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept user');
    } finally {
      setAccepting(false);
    }
  };

  const handleApproveConfirm = async () => {
    if (!approveConfirm) return;

    setApproving(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${approveConfirm.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldRole: approveFieldRole, requestedBy: currentUser?.uid }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve user');
      }

      fetchUsers();
      setApproveConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user');
    } finally {
      setApproving(false);
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
        <PortalPageHeader
          compact
          eyebrow="Administration"
          title="User Management"
          description="Manage employee accounts, roles, and access status."
          actions={
            <Button asChild className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/portal/admin/users/new">
                <Plus className="h-4 w-4" />
                Add User
              </Link>
            </Button>
          }
        />

        <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-muted-foreground">Role</label>
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
                <label className="text-sm font-medium text-slate-700 dark:text-muted-foreground">Status</label>
                <NativeSelect
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'active' | 'inactive' | 'pending' | '')
                  }
                  className="w-36"
                >
                  <NativeSelectOption value="">All</NativeSelectOption>
                  <NativeSelectOption value="pending">Pending</NativeSelectOption>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                </NativeSelect>
              </div>
              {(roleFilter || statusFilter) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-slate-600 dark:text-muted-foreground hover:text-slate-950 dark:hover:text-foreground"
                  onClick={() => {
                    setRoleFilter('');
                    setStatusFilter('');
                  }}
                >
                  Clear filters
                </Button>
              )}
              <span className="ml-auto text-sm text-slate-500 dark:text-muted-foreground">
                {users.length} user{users.length !== 1 ? 's' : ''} found
              </span>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-border bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="portal-enter portal-enter-3">
          {loading ? (
            <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card text-center shadow-sm">
              <CardContent className="py-8">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
                <p className="mt-4 text-sm text-slate-500 dark:text-muted-foreground">Loading users...</p>
              </CardContent>
            </Card>
          ) : (
            <UserTable
              users={users}
              onStatusChange={handleStatusChange}
              onApprove={handleApproveClick}
              onAccept={handleAcceptClick}
              onDelete={handleDeleteClick}
              loading={loading || approving || accepting || deleting}
            />
          )}
        </div>

        {approveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-xl">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-slate-950 dark:text-foreground">Assign Role</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-muted-foreground">
                  Assign a role to <strong>{approveConfirm.userName}</strong>. Their account stays pending until
                  the onboarding checklist is complete.
                </p>
                <div className="mt-5 space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-muted-foreground">
                    Field role
                  </label>
                  <NativeSelect
                    value={approveFieldRole}
                    onChange={(e) => setApproveFieldRole(e.target.value as FieldRole)}
                    disabled={approving}
                  >
                    {FIELD_ROLE_OPTIONS.map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        {RoleDisplayNames[value]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setApproveConfirm(null)}
                    disabled={approving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApproveConfirm}
                    disabled={approving}
                    className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                  >
                    {approving ? 'Assigning...' : 'Assign Role'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {acceptConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-xl">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-slate-950 dark:text-foreground">Accept User</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-muted-foreground">
                  This skips the remaining onboarding steps and activates{' '}
                  <strong>{acceptConfirm.userName}</strong>
                  {acceptConfirm.fieldRole === 'entry_level_rep'
                    ? ' as an Account Executive.'
                    : '.'}
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAcceptConfirm(null)}
                    disabled={accepting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAcceptConfirm}
                    disabled={accepting}
                    className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                  >
                    {accepting ? 'Accepting...' : 'Accept & Activate'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-xl">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-red-50 dark:bg-red-500/15 p-2 text-red-600 dark:text-red-300">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-foreground">Delete User</h3>
                </div>
                <p className="mb-6 text-sm text-slate-600 dark:text-muted-foreground">
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
