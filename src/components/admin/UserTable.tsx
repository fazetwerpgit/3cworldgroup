'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { User, UserRole, RoleDisplayNames, getEffectiveRole } from '@/types';
import { isOnline } from '@/lib/presence/isOnline';
import { AdminConfirmStrip } from '@/components/admin/AdminCatalogList';

interface UserTableProps {
  users: User[];
  onStatusChange?: (userId: string, status: 'active' | 'inactive') => void;
  onApprove?: (userId: string) => void;
  onAccept?: (userId: string) => void;
  onDelete?: (userId: string, userName: string) => void;
  onPersonLink?: (userId: string) => void;
  loading?: boolean;
  /** uid -> approved (all-time) sales count, from the existing leaderboard
   * endpoint (GET /api/portal/leaderboard?period=all&metric=totalSales).
   * Absent from the board = zero approved sales, so a missing entry renders
   * "0", the honest value — never "—". */
  salesCounts?: Record<string, number>;
}

function formatDate(date: Date | string | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initials(name?: string, email?: string) {
  const source = name || email || 'U';
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'U';
}

export function UserTable({
  users,
  onStatusChange,
  onApprove,
  onAccept,
  onDelete,
  onPersonLink,
  loading,
  salesCounts,
}: UserTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);

  if (users.length === 0) {
    return (
      <div className="admin-line-empty-state" style={{ display: 'block' }}>
        <UserPlus className="mb-2 h-6 w-6" style={{ color: 'var(--admin-line-muted)' }} />
        <strong>No people match this filter.</strong>
        Try a broader search or clear the filters.
      </div>
    );
  }

  return (
    <div className="admin-line-people-shell" id="people-list">
      {users.map((user) => {
        const hireDate = formatDate(user.hireDate);
        const roleKey = getEffectiveRole(user);
        const roleLabel = roleKey ? RoleDisplayNames[roleKey as UserRole] : '—';
        const status = user.status || 'active';
        const displayName = user.displayName || user.email || 'this user';
        const approvedSales = salesCounts?.[user.uid] ?? 0;

        return (
          <div className="admin-line-people-row" key={user.uid}>
            <div className="admin-line-person">
              <span className="admin-line-avatar">{initials(user.displayName, user.email)}</span>
              <span>
                <strong>
                  {displayName}
                  {isOnline(user.lastActiveAt) && <span className="admin-line-online-dot" />}
                </strong>
                <small>{user.email}</small>
              </span>
            </div>
            <div className="admin-line-row-cell">
              <span className="admin-line-role">{roleLabel}</span>
            </div>
            <div className="admin-line-row-cell">
              <span className={`admin-line-status ${status}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            <div className="admin-line-row-cell">
              <strong>{hireDate || (status === 'pending' ? '—' : 'N/A')}</strong>
              <small>{status === 'pending' ? 'requested' : 'hire date'}</small>
            </div>
            <div className="admin-line-row-cell">
              <strong>{approvedSales}</strong>
              <small>approved sales</small>
            </div>
            <div className="admin-line-row-actions">
              <button
                type="button"
                className="admin-line-action"
                onClick={() => onPersonLink?.(user.uid)}
              >
                Person
              </button>
              {onApprove && status === 'pending' && !user.fieldRole && (
                <button
                  type="button"
                  className="admin-line-primary"
                  onClick={() => onApprove(user.uid)}
                  disabled={loading}
                >
                  Assign role
                </button>
              )}
              {onAccept && status === 'pending' && user.fieldRole && (
                <button
                  type="button"
                  className="admin-line-primary"
                  onClick={() => setConfirmAcceptId(user.uid)}
                  disabled={loading}
                >
                  Accept
                </button>
              )}
              {onStatusChange && status === 'active' && (
                <button
                  type="button"
                  className="admin-line-action"
                  onClick={() => onStatusChange(user.uid, 'inactive')}
                  disabled={loading}
                >
                  Deactivate
                </button>
              )}
              {onStatusChange && status === 'inactive' && (
                <button
                  type="button"
                  className="admin-line-action"
                  onClick={() => onStatusChange(user.uid, 'active')}
                  disabled={loading}
                >
                  Activate
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="admin-line-action danger"
                  onClick={() => setConfirmDeleteId(user.uid)}
                  disabled={loading}
                >
                  Delete
                </button>
              )}
            </div>
            {onAccept && confirmAcceptId === user.uid && (
              <AdminConfirmStrip
                label={`Accept & activate ${displayName}?`}
                confirming={loading}
                confirmingLabel="Accepting…"
                onCancel={() => setConfirmAcceptId(null)}
                onConfirm={() => {
                  onAccept(user.uid);
                  setConfirmAcceptId(null);
                }}
              />
            )}
            {onDelete && confirmDeleteId === user.uid && (
              <AdminConfirmStrip
                label={`Delete ${displayName}?`}
                confirming={loading}
                onCancel={() => setConfirmDeleteId(null)}
                onConfirm={() => {
                  onDelete(user.uid, displayName);
                  setConfirmDeleteId(null);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
