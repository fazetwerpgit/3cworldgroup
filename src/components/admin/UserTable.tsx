'use client';

import { ChevronRight } from 'lucide-react';
import { User, UserRole, RoleDisplayNames, getEffectiveRole } from '@/types';
import { isOnline } from '@/lib/presence/isOnline';
import { AdminEmpty, StatusDot, type Tone } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import t from './user-table.module.css';

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

const STATUS_TONE: Record<string, Tone> = {
  active: 'lime',
  pending: 'amber',
  inactive: 'muted',
};

function formatDate(date: Date | string | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The member directory. Desktop: a D table. Phone: each person is a stacked
 * card (name + status on top, then role, date and sales as label lines).
 */
export function UserTable({
  users,
  onApprove,
  onPersonLink,
  loading,
  salesCounts,
}: UserTableProps) {
  if (users.length === 0) {
    return (
      <AdminEmpty title="No people match this filter.">
        Try a broader search or clear the filters.
      </AdminEmpty>
    );
  }

  return (
    <ul className={`${u.rows} ${t.cols}`} id="people-list">
      <li className={u.tHead} aria-hidden="true">
        <span>Person</span>
        <span>Role</span>
        <span>Status</span>
        <span>Hired</span>
        <span className={u.alignEnd}>Sales</span>
        <span />
        <span />
      </li>
      {users.map((user) => {
        const roleKey = getEffectiveRole(user);
        const roleLabel = roleKey ? RoleDisplayNames[roleKey as UserRole] : null;
        const status = user.status || 'active';
        const isPending = status === 'pending';
        const dateValue = isPending ? formatDate(user.createdAt) : formatDate(user.hireDate);
        const displayName = user.displayName || user.email || 'this user';
        const approvedSales = salesCounts?.[user.uid] ?? 0;
        const canAssign = !!onApprove && isPending && !user.fieldRole;

        return (
          <li
            key={user.uid}
            className={`${u.row} ${t.row} ${isPending ? u.rowWarn : ''}`}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) return;
              onPersonLink?.(user.uid);
            }}
          >
            <span className={`${u.cellMain} ${u.person}`}>
              <span className={u.personText}>
                <button type="button" className={t.nameBtn} onClick={() => onPersonLink?.(user.uid)}>
                  <span className={u.personName}>
                    <span>{displayName}</span>
                    {isOnline(user.lastActiveAt) ? (
                      <span className={u.online} role="img" aria-label="Online now" />
                    ) : null}
                  </span>
                </button>
                <span className={u.personSub}>{user.email}</span>
              </span>
            </span>

            <span className={`${u.cell} ${t.role}`} data-label="Role">
              {roleLabel ? <span>{roleLabel}</span> : <span className={u.toneMuted}>No role yet</span>}
            </span>

            <span className={`${u.cellEnd} ${t.statusCell}`}>
              <StatusDot tone={STATUS_TONE[status] ?? 'muted'}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </StatusDot>
            </span>

            <span className={`${u.cell} ${u.num}`} data-label={isPending ? 'Requested' : 'Hire date'}>
              <span>
                {dateValue || (isPending ? '—' : 'N/A')}
                {isPending ? <span className={`${u.cellSub} ${t.deskOnly}`}>requested</span> : null}
              </span>
            </span>

            <span className={`${u.cell} ${u.num} ${u.alignEnd}`} data-label="Approved sales">
              {approvedSales}
            </span>

            <span className={`${u.cell} ${t.action}`}>
              {canAssign ? (
                <button
                  type="button"
                  className={`${s.btnSecondary} ${u.sm}`}
                  onClick={() => onApprove?.(user.uid)}
                  disabled={loading}
                >
                  Assign role
                </button>
              ) : null}
            </span>

            <ChevronRight size={20} className={`${u.chev} ${t.chev}`} aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );
}
