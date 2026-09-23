'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { UserTable } from '@/components/admin/UserTable';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
} from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { FieldRole, FieldRoles, User, RoleDisplayNames } from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import p from './users.module.css';

// Assignable field roles only — retired tiers (IBO levels, L1/L2 manager)
// stay valid for users who already hold them but are never offered here.
const FIELD_ROLE_OPTIONS = (Object.values(FieldRoles) as FieldRole[]).filter(
  (role) => !role.startsWith('ibo_level_') && role !== 'l1_manager' && role !== 'l2_manager',
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

const ROLE_BUCKETS: { value: RoleBucket; label: string }[] = [
  { value: 'all', label: 'All roles' },
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'operations', label: 'Operations' },
  { value: 'field rep', label: 'Field rep' },
];

const STATUS_BUCKETS: { value: StatusBucket; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

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
  const [loadError, setLoadError] = useState('');
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
    setLoadError('');
    try {
      const response = await fetch('/api/portal/auth/users', {
        headers: await authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch users');
      setUsers(data.users);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to fetch users');
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
        // fail-soft, sales column shows "0"
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
        !q || (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || bucketForUser(u) === roleFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<RoleBucket, number> = {
      all: users.length,
      owner: 0,
      admin: 0,
      operations: 0,
      'field rep': 0,
    };
    for (const user of users) counts[bucketForUser(user)] += 1;
    return counts;
  }, [users]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusBucket, number> = {
      all: users.length,
      pending: 0,
      active: 0,
      inactive: 0,
    };
    for (const user of users) if (user.status && user.status in counts) counts[user.status as StatusBucket] += 1;
    return counts;
  }, [users]);

  // Same real data this page already fetched — the "needs a decision" strip
  // is not a new query, per orchestrator ruling.
  const pendingUsers = useMemo(() => users.filter((u) => u.status === 'pending' && !u.suspectedBot), [users]);

  const approveUser = users.find((user) => user.uid === approvePanel) ?? null;

  const openAssignRole = (uid: string) => {
    setApproveFieldRole('entry_level_rep');
    setApprovePanel(uid);
  };

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

  const loaded = !loading || users.length > 0;
  const failed = !!loadError && users.length === 0;
  const filtersActive = !!query || roleFilter !== 'all' || statusFilter !== 'all';
  const isFilteredEmpty = users.length > 0 && filteredUsers.length === 0;
  const isTrueEmpty = !loading && !loadError && users.length === 0;

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          title="User Management"
          meta={
            loaded && !failed ? (
              <>
                <b>{users.length}</b> members
                {pendingUsers.length ? (
                  <>
                    {' · '}
                    <b className={u.toneAmber}>{pendingUsers.length}</b> pending
                  </>
                ) : null}
              </>
            ) : null
          }
        />

        {error && !approveUser ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>
            {error}
          </AdminNotice>
        ) : null}

        {loadError && users.length > 0 ? (
          <AdminNotice tone="error" onDismiss={() => setLoadError('')}>
            Couldn&apos;t refresh the member list. {loadError}
          </AdminNotice>
        ) : null}

        {pendingUsers.length > 0 ? (
          <section className={`${s.panel} ${p.pending}`} aria-labelledby="users-pending-heading">
            <div className={s.panelHead}>
              <h2 id="users-pending-heading" className={s.kicker}>
                Pending approval
              </h2>
              <span className={u.panelMeta}>{pendingUsers.length} waiting</span>
            </div>
            <ul className={u.rows}>
              {pendingUsers.map((user) => {
                const name = user.displayName || user.email || 'this user';
                return (
                  <li key={user.uid} className={`${u.row} ${p.pendingRow}`}>
                    <Link href={`/portal/admin/users/${user.uid}`} className={`${u.person} ${p.personLink}`}>
                      <span className={u.personText}>
                        <span className={u.personName}>
                          <span>{name}</span>
                        </span>
                        <span className={u.personSub}>
                          {user.email} · requested {timeAgo(user.createdAt)}
                        </span>
                      </span>
                    </Link>
                    <span className={p.pendingAction}>
                      {!user.fieldRole ? (
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${u.sm}`}
                          onClick={() => openAssignRole(user.uid)}
                        >
                          Assign role
                        </button>
                      ) : (
                        <Link href={`/portal/admin/users/${user.uid}`} className={p.acceptLink}>
                          Open profile to accept
                          <ChevronRight size={18} aria-hidden="true" />
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className={s.panel} aria-labelledby="users-all-heading">
          <div className={s.panelHead}>
            <h2 id="users-all-heading" className={s.kicker}>
              All members
            </h2>
            {loaded && !failed ? (
              <span className={u.panelMeta}>
                {filtersActive ? `${filteredUsers.length} of ${users.length}` : `${users.length}`}
              </span>
            ) : null}
          </div>

          {!failed && !isTrueEmpty ? (
            <div className={p.filters}>
              <div className={u.toolbar}>
                <label className={`${u.search} ${p.searchBox}`}>
                  <Search size={18} aria-hidden="true" />
                  <input
                    className={u.input}
                    type="search"
                    placeholder="Search name or email"
                    aria-label="Search people"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className={`${u.segmented} ${p.status}`} role="group" aria-label="Filter by status">
                  {STATUS_BUCKETS.map((bucket) => (
                    <button
                      key={bucket.value}
                      type="button"
                      aria-pressed={statusFilter === bucket.value}
                      onClick={() => setStatusFilter(bucket.value)}
                    >
                      {bucket.label}
                      {bucket.value !== 'all' && loaded && !failed ? (
                        <span className={p.segCount}>{statusCounts[bucket.value]}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${s.btnSecondary} ${u.sm} ${u.quiet} ${p.clear}`}
                  onClick={clearFilters}
                  disabled={!filtersActive}
                >
                  Clear
                </button>
              </div>
              <div className={`${u.chips} ${p.roleChips}`} role="group" aria-label="Filter by role">
                {ROLE_BUCKETS.map((bucket) => (
                  <button
                    key={bucket.value}
                    type="button"
                    className={u.chip}
                    aria-pressed={roleFilter === bucket.value}
                    onClick={() => setRoleFilter(bucket.value)}
                  >
                    {bucket.label}
                    {loaded && !failed ? <span className={u.chipCount}>{roleCounts[bucket.value]}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {loading && users.length === 0 ? (
            <AdminSkeletonRows rows={6} label="Loading members" />
          ) : failed ? (
            <AdminFailed what="members" onRetry={() => void fetchUsers()} />
          ) : isTrueEmpty ? (
            <AdminEmpty title="No members yet.">
              Invite the first person to start the directory.
            </AdminEmpty>
          ) : isFilteredEmpty ? (
            <AdminEmpty
              title="No people match this filter."
              action={
                <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={clearFilters}>
                  Clear filters
                </button>
              }
            >
              Try a broader search or clear the filters.
            </AdminEmpty>
          ) : (
            <UserTable
              users={filteredUsers}
              onApprove={openAssignRole}
              onPersonLink={(uid) => router.push(`/portal/admin/users/${uid}`)}
              loading={loading || approving}
              salesCounts={salesCounts}
            />
          )}
        </section>
      </div>

      {approveUser ? (
        <AdminSheet
          title="Assign role"
          description={`${approveUser.displayName || approveUser.email || 'This person'} needs a role before approval.`}
          onClose={() => {
            if (!approving) setApprovePanel(null);
          }}
          footer={
            <>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                onClick={() => setApprovePanel(null)}
                disabled={approving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                disabled={approving}
                onClick={() => handleApproveConfirm(approveUser.uid)}
              >
                {approving ? 'Assigning…' : 'Confirm role'}
              </button>
            </>
          }
        >
          <div className={u.sheetPad}>
            {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
            <div className={u.field}>
              <label className={u.label} htmlFor="assign-field-role">
                Field role
              </label>
              <span className={u.selectWrap}>
                <select
                  id="assign-field-role"
                  className={u.input}
                  value={approveFieldRole}
                  onChange={(e) => setApproveFieldRole(e.target.value as FieldRole)}
                >
                  {FIELD_ROLE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {RoleDisplayNames[value]}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </div>
          </div>
        </AdminSheet>
      ) : null}
    </AdminGate>
  );
}
