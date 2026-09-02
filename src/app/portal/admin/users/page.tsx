'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-admin-a.css';
import { UserTable } from '@/components/admin/UserTable';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { FieldRole, FieldRoles, User, RoleDisplayNames } from '@/types';

// Assignable field roles only — retired tiers (IBO levels, L1/L2 manager)
// stay valid for users who already hold them but are never offered here.
const FIELD_ROLE_OPTIONS = (Object.values(FieldRoles) as FieldRole[]).filter(
  (role) => !role.startsWith('ibo_level_') && role !== 'l1_manager' && role !== 'l2_manager'
);

// The user-management routes verify the caller from the ID token. The userId in
// each URL is the TARGET being read, edited or deleted — management acting on
// another account is the whole point of these endpoints.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

type RoleBucket = 'all' | 'owner' | 'admin' | 'operations' | 'field rep';
type StatusBucket = 'all' | 'pending' | 'active' | 'inactive';

function bucketForUser(user: User): RoleBucket {
  const role = user.role ?? user.fieldRole;
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'operations') return 'operations';
  return 'field rep';
}

function timeAgo(date: Date | string | number | undefined) {
  if (!date) return 'recently';
  const d = new Date(date).getTime();
  const diffMs = Date.now() - d;
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export default function UsersPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleBucket>('all');
  const [statusFilter, setStatusFilter] = useState<StatusBucket>('all');
  const [query, setQuery] = useState('');
  const [salesCounts, setSalesCounts] = useState<Record<string, number>>({});
  const [approvePanel, setApprovePanel] = useState<string | null>(null);
  const [approveFieldRole, setApproveFieldRole] = useState<FieldRole>('entry_level_rep');
  const [approving, setApproving] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/portal/auth/users', { headers: await authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch users');
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Real approved-sales-per-person count, reused from the existing leaderboard
  // endpoint (all-time totalSales, no new route). Absence from the board means
  // zero approved sales, so UserTable renders a missing entry as "0".
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const res = await fetch('/api/portal/leaderboard?period=all&metric=totalSales&limit=1000', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json();
        if (!res.ok || !active) return;
        const map: Record<string, number> = {};
        for (const entry of data.leaderboard || []) {
          map[entry.salesRepId] = entry.totalSales;
        }
        setSalesCounts(map);
      } catch {
        // fail-soft, sales column shows "—"
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const matchesQuery =
        !q ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || bucketForUser(u) === roleFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  // Same real data this page already fetched — the "needs a decision" strip
  // is not a new query, per orchestrator ruling.
  const pendingUsers = useMemo(
    () => users.filter((u) => u.status === 'pending' && !u.suspectedBot),
    [users]
  );

  const handleApproveConfirm = async (userId: string) => {
    setApproving(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${userId}`, {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({ fieldRole: approveFieldRole }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve user');
      }
      await fetchUsers();
      setApprovePanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user');
    } finally {
      setApproving(false);
    }
  };

  const clearFilters = () => {
    setQuery('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  const isFilteredEmpty = users.length > 0 && filteredUsers.length === 0;
  const isTrueEmpty = !loading && users.length === 0;

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="admin-line-main">
        <div className="admin-line">
          <PageTitle title="User Management" meta={`${users.length} members`} subtitle={`${pendingUsers.length} pending approval`} />

          <div className="admin-line-toolbar">
            <input
              className="admin-line-search"
              type="search"
              placeholder="Search name or email"
              aria-label="Search people"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="admin-line-pill-row" role="group" aria-label="Filter by role">
              {(['all', 'owner', 'admin', 'operations', 'field rep'] as RoleBucket[]).map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={roleFilter === bucket}
                  onClick={() => setRoleFilter(bucket)}
                >
                  {bucket === 'all' ? 'All Roles' : bucket === 'field rep' ? 'Field Rep' : bucket.charAt(0).toUpperCase() + bucket.slice(1)}
                </button>
              ))}
            </div>
            <div className="admin-line-segmented" role="group" aria-label="Filter by status">
              {(['all', 'pending', 'active', 'inactive'] as StatusBucket[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <button type="button" className="admin-line-clear-button" onClick={clearFilters}>
              Clear
            </button>
          </div>

          {error && (
            <div className="admin-line-empty-state" style={{ display: 'block', borderColor: 'var(--admin-line-red)', color: 'var(--admin-line-red)' }}>
              {error}
            </div>
          )}

          {pendingUsers.length > 0 && (
            <div className="admin-line-decision-strip">
              <div className="admin-line-decision-head">
                <div>
                  <h3>
                    Pending approval <span className="sweep-admin-heading-count">· {pendingUsers.length}</span>
                  </h3>
                </div>
              </div>
              {pendingUsers.map((u) => {
                const name = u.displayName || u.email || 'this user';
                return (
                  <div
                    className="admin-line-decision-row sweep-user-row"
                    key={u.uid}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/portal/admin/users/${u.uid}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/portal/admin/users/${u.uid}`);
                      }
                    }}
                  >
                    <div className="admin-line-person">
                      <span className="admin-line-avatar">{(name.charAt(0) || 'U').toUpperCase()}</span>
                      <span>
                        <strong>{name}</strong>
                        <small>
                          {u.email} · requested {timeAgo(u.createdAt)}
                        </small>
                      </span>
                    </div>
                    <div className="admin-line-decision-actions">
                      {!u.fieldRole ? (
                        <button
                          type="button"
                          className="admin-line-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            setApproveFieldRole('entry_level_rep');
                            setApprovePanel(approvePanel === u.uid ? null : u.uid);
                          }}
                        >
                          Assign Role
                        </button>
                      ) : (
                        <span className="sweep-admin-label">Open profile to accept</span>
                      )}
                    </div>
                    {approvePanel === u.uid && (
                      <div className="admin-line-approval-panel open">
                        <div className="admin-line-meta">Assign role before approval</div>
                        <div className="admin-line-field">
                          <select
                            aria-label="Field role"
                            value={approveFieldRole}
                            onChange={(e) => setApproveFieldRole(e.target.value as FieldRole)}
                          >
                            {FIELD_ROLE_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {RoleDisplayNames[value]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="admin-line-primary"
                            disabled={approving}
                            onClick={() => handleApproveConfirm(u.uid)}
                          >
                            {approving ? 'Assigning…' : 'Confirm Role'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="admin-line-section-head">
            <div>
              <h2>
                All members <span className="sweep-admin-heading-count">· {filteredUsers.length}</span>
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="admin-line-empty-state" style={{ display: 'block' }}>
              <strong>Loading roster…</strong>
            </div>
          ) : isTrueEmpty ? (
            <div className="admin-line-empty-state" id="directory-empty" style={{ display: 'block' }}>
              <strong>No members yet.</strong>
              Invite the first person to start the directory.
            </div>
          ) : isFilteredEmpty ? (
            <div className="admin-line-empty-state" id="people-empty" style={{ display: 'block' }}>
              <strong>No people match this filter.</strong>
              Try a broader search or clear the filters.{' '}
              <button type="button" className="admin-line-primary" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <UserTable
              users={filteredUsers}
              onApprove={(uid) => {
                setApproveFieldRole('entry_level_rep');
                setApprovePanel(uid);
              }}
              onPersonLink={(uid) => router.push(`/portal/admin/users/${uid}`)}
              loading={loading || approving}
              salesCounts={salesCounts}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
