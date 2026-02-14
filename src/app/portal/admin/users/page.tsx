'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { UserTable } from '@/components/admin/UserTable';
import { User, UserRole } from '@/types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | ''>('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; userName: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);

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
  }, [roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleStatusChange = async (userId: string, status: 'active' | 'inactive') => {
    try {
      const response = await fetch(`/api/portal/auth/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      // Refresh the list
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
      const response = await fetch(`/api/portal/auth/users/${deleteConfirm.userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      // Refresh the list
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
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0A1F44]">User Management</h1>
                  <p className="text-gray-500 mt-1">
                    Manage employee accounts and permissions
                  </p>
                </div>
                <Link
                  href="/portal/admin/users/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add User
                </Link>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Role:</label>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    >
                      <option value="">All Roles</option>
                      <option value="admin">Administrator</option>
                      <option value="operations">Operations</option>
                      <option value="sales_manager">Sales Manager</option>
                      <option value="sales_rep">Sales Rep</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Status:</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | '')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    >
                      <option value="">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  {(roleFilter || statusFilter) && (
                    <button
                      onClick={() => {
                        setRoleFilter('');
                        setStatusFilter('');
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear filters
                    </button>
                  )}
                  <span className="text-sm text-gray-500 ml-auto">
                    {users.length} user{users.length !== 1 ? 's' : ''} found
                  </span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Loading */}
              {loading ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading users...</p>
                </div>
              ) : (
                <UserTable
                  users={users}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDeleteClick}
                  loading={loading || deleting}
                />
              )}

              {/* Delete Confirmation Modal */}
              {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-red-100 rounded-full">
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Delete User</h3>
                    </div>
                    <p className="text-gray-600 mb-6">
                      Are you sure you want to permanently delete <strong>{deleteConfirm.userName}</strong>?
                      This action cannot be undone. The user will be removed from the system completely.
                    </p>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        disabled={deleting}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteConfirm}
                        disabled={deleting}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Delete User'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
