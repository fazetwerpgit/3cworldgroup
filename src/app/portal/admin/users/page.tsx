'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserTable } from '@/components/admin/UserTable';
import { AdminConfirmStrip } from '@/components/admin/AdminCatalogList';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { FieldRole, FieldRoles, User, RoleDisplayNames } from '@/types';

const FIELD_ROLE_OPTIONS = Object.values(FieldRoles) as FieldRole[];

type RoleBucket = 'all' | 'admin' | 'operations' | 'field rep';
type StatusBucket = 'all' | 'pending' | 'active' | 'inactive';

function bucketForUser(user: User): RoleBucket {
  const role = user.role ?? user.fieldRole;
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
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);
  const [approveFieldRole, setApproveFieldRole] = useState<FieldRole>('entry_level_rep');
  const [approving, setApproving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('requestedBy', currentUser.uid);
      const response = await fetch(`/api/portal/auth/users?${params.toString()}`);
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
  const pendingUsers = useMemo(() => users.filter((u) => u.status === 'pending'), [users]);

  const handleStatusChange = async (userId: string, status: 'active' | 'inactive') => {
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

  const handleAcceptConfirm = async (userId: string) => {
    const target = users.find((u) => u.uid === userId);
    if (!target?.fieldRole || target.status !== 'pending') return;
    setAccepting(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          requestedBy: currentUser?.uid,
          ...(target.fieldRole === 'entry_level_rep' ? { fieldRole: 'entry_rep' } : {}),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept user');
      }
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept user');
    } finally {
      setAccepting(false);
    }
  };

  const handleApproveConfirm = async (userId: string) => {
    setApproving(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldRole: approveFieldRole, requestedBy: currentUser?.uid }),
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

  const handleDelete = async (userId: string) => {
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(
        `/api/portal/auth/users/${userId}?requestedBy=${currentUser?.uid ?? ''}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
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
          <header className="admin-line-hero">
            <div>
              <div className="admin-line-kicker">admin management / the roster</div>
              <h1>
                <span className="accent">Keep the roster</span>
                <span className="plain">close to the work.</span>
              </h1>
              <p className="admin-line-intro">
                A practical people-and-records view for decisions that should stay visible: who
                needs approval, who is active, and who can move to the next record.
              </p>
              <div className="admin-line-quick-rail">
                <span className="admin-line-chip lime">
                  {users.length} member{users.length === 1 ? '' : 's'} / {pendingUsers.length} pending
                </span>
                <span className="admin-line-chip">updated moments ago</span>
              </div>
            </div>
            <div className="admin-line-hero-count">
              <span className="admin-line-display portal-metallic-num">{users.length}</span>
              <small>members on file</small>
            </div>
          </header>

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
              {(['all', 'admin', 'operations', 'field rep'] as RoleBucket[]).map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={roleFilter === bucket}
                  onClick={() => setRoleFilter(bucket)}
                >
                  {bucket === 'all' ? 'All roles' : bucket}
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
                  {s === 'all' ? 'All' : s}
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
                  <div className="admin-line-eyebrow">needs a decision</div>
                  <h3>Pending people, surfaced first.</h3>
                </div>
                <span className="admin-line-meta">{pendingUsers.length} waiting</span>
              </div>
              {pendingUsers.map((u) => {
                const name = u.displayName || u.email || 'this user';
                return (
                  <div className="admin-line-decision-row" key={u.uid}>
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
                          onClick={() => {
                            setApproveFieldRole('entry_level_rep');
                            setApprovePanel(approvePanel === u.uid ? null : u.uid);
                          }}
                        >
                          Assign role
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-line-primary"
                          disabled={accepting}
                          onClick={() => setConfirmAcceptId(u.uid)}
                        >
                          {accepting ? 'Accepting…' : 'Accept'}
                        </button>
                      )}
                    </div>
                    {confirmAcceptId === u.uid && (
                      <AdminConfirmStrip
                        label={`Accept & activate ${name}?`}
                        confirming={accepting}
                        confirmingLabel="Accepting…"
                        onCancel={() => setConfirmAcceptId(null)}
                        onConfirm={() => {
                          handleAcceptConfirm(u.uid);
                          setConfirmAcceptId(null);
                        }}
                      />
                    )}
                    {approvePanel === u.uid && (
                      <div className="admin-line-approval-panel open">
                        <div className="admin-line-meta">Assign role before approval</div>
                        <div className="admin-line-segmented" role="group" aria-label="Field role">
                          {FIELD_ROLE_OPTIONS.map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={approveFieldRole === value}
                              onClick={() => setApproveFieldRole(value)}
                            >
                              {RoleDisplayNames[value]}
                            </button>
                          ))}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="admin-line-primary"
                            disabled={approving}
                            onClick={() => handleApproveConfirm(u.uid)}
                          >
                            {approving ? 'Assigning…' : 'Confirm role'}
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
              <div className="admin-line-eyebrow">01 / member records</div>
              <h2>Everyone on the line.</h2>
            </div>
            <div className="right admin-line-meta" id="people-count">
              {filteredUsers.length} record{filteredUsers.length === 1 ? '' : 's'} · sorted by attention
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
              onStatusChange={handleStatusChange}
              onApprove={(uid) => {
                setApproveFieldRole('entry_level_rep');
                setApprovePanel(uid);
              }}
              onAccept={handleAcceptConfirm}
              onDelete={(uid) => handleDelete(uid)}
              onPersonLink={(uid) => router.push(`/portal/admin/users/${uid}`)}
              loading={loading || approving || accepting || deleting}
              salesCounts={salesCounts}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
