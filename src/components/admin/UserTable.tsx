'use client';

import { UserPlus } from 'lucide-react';
import { User, UserRole, RoleDisplayNames, getEffectiveRole } from '@/types';
import { isOnline } from '@/lib/presence/isOnline';

interface UserTableProps {
  users: User[];
  onApprove?: (userId: string) => void;
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
  onApprove,
  onPersonLink,
  loading,
  salesCounts,
}: UserTableProps) {
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
          <div
            className="admin-line-people-row sweep-user-row"
            key={user.uid}
            role="button"
            tabIndex={0}
            onClick={() => onPersonLink?.(user.uid)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPersonLink?.(user.uid);
              }
            }}
          >
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
              {onApprove && status === 'pending' && !user.fieldRole && (
                <button
                  type="button"
                  className="admin-line-primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    onApprove(user.uid);
                  }}
                  disabled={loading}
                >
                  Assign Role
                </button>
              )}
              <span className="sweep-user-chevron" aria-hidden="true">›</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
