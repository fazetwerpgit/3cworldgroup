'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useFiberStatus } from '@/hooks/useFiberStatus';
import type { FiberOrder, FiberOrderStatus, FiberStatusResponse } from '@/types';

type FiberFilter = 'all' | 'pending' | 'active' | 'cancelled' | 'attention';
export type FiberBucket = Exclude<FiberFilter, 'all'>;

export type FiberStatusHookResult = {
  data: FiberStatusResponse | null;
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  /** `fresh` bypasses the server's fiberOrders cache — for post-write reads only. */
  refetch: (opts?: { fresh?: boolean }) => Promise<void>;
};

const FILTERS: Array<{ key: FiberFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending install' },
  { key: 'active', label: 'Active' },
  { key: 'cancelled', label: 'Cancelled/Churned' },
  { key: 'attention', label: 'Attention' },
];

const STATUS_LABELS: Record<FiberOrderStatus, string> = {
  pending_install: 'Pending install',
  active: 'Active',
  pre_sale: 'Pre-sale',
  cancelled: 'Cancelled',
  churned: 'Churned',
  breakage: 'Attention',
};

const SUMMARY_LABELS: Record<Exclude<FiberFilter, 'all'>, string> = {
  pending: 'pending',
  attention: 'attention',
  active: 'active',
  cancelled: 'cancelled',
};

type PortalUser = { uid: string; displayName?: string | null };

type AssignmentGroup = {
  key: string;
  repName: string;
  dealerId: string;
  orders: FiberOrder[];
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
    : null;
}

function relativeReportDate(value: string | null) {
  const date = parseDate(value);
  if (!date) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const reportDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.max(0, Math.floor((today - reportDay) / 86_400_000));

  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function statusGroup(status: FiberOrderStatus): Exclude<FiberFilter, 'all'> {
  if (status === 'pending_install' || status === 'pre_sale') return 'pending';
  if (status === 'active') return 'active';
  if (status === 'cancelled' || status === 'churned') return 'cancelled';
  return 'attention';
}

function sortRank(status: FiberOrderStatus) {
  if (status === 'breakage' || status === 'pending_install' || status === 'pre_sale') return 0;
  if (status === 'active') return 1;
  if (status === 'cancelled' || status === 'churned') return 2;
  return 3;
}

function sortDate(order: FiberOrder) {
  if (sortRank(order.status) === 0) return parseDate(order.estInstallDate)?.getTime() ?? null;
  if (order.status === 'active') return parseDate(order.activationDate)?.getTime() ?? null;
  if (order.status === 'cancelled') return parseDate(order.cancellationDate ?? order.deactivationDate)?.getTime() ?? null;
  if (order.status === 'churned') return parseDate(order.deactivationDate ?? order.cancellationDate)?.getTime() ?? null;
  return null;
}

export function sortFiberOrders(orders: FiberOrder[]) {
  return [...orders].sort((a, b) => {
    const rankDifference = sortRank(a.status) - sortRank(b.status);
    if (rankDifference) return rankDifference;

    const aDate = sortDate(a);
    const bDate = sortDate(b);
    if (aDate === null && bDate !== null) return 1;
    if (aDate !== null && bDate === null) return -1;
    if (aDate !== null && bDate !== null && aDate !== bDate) {
      return sortRank(a.status) === 0 ? aDate - bDate : bDate - aDate;
    }

    return `${a.address} ${a.id}`.localeCompare(`${b.address} ${b.id}`);
  });
}

function statusSummary(orders: FiberOrder[]) {
  const counts: Record<Exclude<FiberFilter, 'all'>, number> = {
    pending: 0,
    attention: 0,
    active: 0,
    cancelled: 0,
  };
  orders.forEach((order) => { counts[statusGroup(order.status)] += 1; });
  return (Object.keys(SUMMARY_LABELS) as Array<Exclude<FiberFilter, 'all'>>)
    .filter((key) => counts[key] > 0)
    .map((key) => `${counts[key]} ${SUMMARY_LABELS[key]}`)
    .join(' · ');
}

function relevantDate(order: FiberOrder) {
  if (order.status === 'pending_install' || order.status === 'pre_sale') {
    return { label: 'Install est.', value: order.estInstallDate };
  }
  if (order.status === 'active') return { label: 'Activated', value: order.activationDate };
  if (order.status === 'cancelled') return { label: 'Cancelled', value: order.cancellationDate ?? order.deactivationDate };
  if (order.status === 'churned') return { label: 'Deactivated', value: order.deactivationDate ?? order.cancellationDate };
  return { label: 'Install est.', value: order.estInstallDate };
}

function truncateNotes(value: string) {
  if (value.length <= 90) return value;
  return `${value.slice(0, 87).trimEnd()}...`;
}

export function FiberStatusPill({ status }: { status: FiberOrderStatus }) {
  return (
    <span className={`sales-line-fiber-status sales-line-fiber-status-${statusGroup(status)}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function FiberOrderRow({ order, showRepName = false }: { order: FiberOrder; showRepName?: boolean }) {
  const location = [order.city, order.state].filter(Boolean).join(', ');
  const date = relevantDate(order);
  const dateLabel = formatDate(date.value);
  const loggedCustomerName = order.loggedCustomerName?.trim();

  return (
    <article className="sales-line-fiber-row">
      <div className="sales-line-fiber-row-primary">
        <div className="sales-line-fiber-address">
          <strong>{loggedCustomerName || order.address || 'Address unavailable'}</strong>
          {loggedCustomerName && <span>{order.address || 'Address unavailable'}</span>}
          {location && <span>{location}</span>}
        </div>
        <FiberStatusPill status={order.status} />
      </div>
      <div className="sales-line-fiber-meta">
        {showRepName && order.repName && <span>{order.repName}</span>}
        {order.fiberPlan && <span>{order.fiberPlan}</span>}
        {dateLabel && <span>{date.label} {dateLabel}</span>}
        {order.status === 'breakage' && order.breakageReason && <span>{order.breakageReason}</span>}
        {order.status === 'breakage' && order.breakageNotes && (
          <span title={order.breakageNotes}>{truncateNotes(order.breakageNotes)}</span>
        )}
        {order.status === 'breakage' && order.customerName && <span>{order.customerName}</span>}
      </div>
    </article>
  );
}

export function FiberRows({ orders, showRepName = false }: { orders: FiberOrder[]; showRepName?: boolean }) {
  return (
    <div className="sales-line-fiber-list">
      {orders.map((order) => <FiberOrderRow key={order.id} order={order} showRepName={showRepName} />)}
    </div>
  );
}

function groupDomId(groupKey: string) {
  return `sales-line-fiber-group-${encodeURIComponent(groupKey).replace(/%/g, '-')}`;
}

function InstallStatusSectionContent({ fiber }: { fiber: FiberStatusHookResult }) {
  const { data, loading, error, refetch } = fiber;
  const [filter, setFilter] = useState<FiberFilter>('all');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});
  const [rematching, setRematching] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const mutationInFlightRef = useRef(false);

  const allOrders = useMemo(
    () => [...(data?.orders ?? []), ...(data?.unmatched ?? [])],
    [data?.orders, data?.unmatched]
  );
  const counts = useMemo(() => {
    const next: Record<FiberFilter, number> = { all: allOrders.length, pending: 0, active: 0, cancelled: 0, attention: 0 };
    allOrders.forEach((order) => { next[statusGroup(order.status)] += 1; });
    return next;
  }, [allOrders]);
  const filteredOrders = useMemo(
    () => sortFiberOrders(allOrders.filter((order) => filter === 'all' || statusGroup(order.status) === filter)),
    [allOrders, filter]
  );
  const matchedOrders = useMemo(
    () => sortFiberOrders((data?.orders ?? []).filter((order) => filter === 'all' || statusGroup(order.status) === filter)),
    [data?.orders, filter]
  );
  const unmatchedOrders = useMemo(
    () => sortFiberOrders((data?.unmatched ?? []).filter((order) => filter === 'all' || statusGroup(order.status) === filter)),
    [data?.unmatched, filter]
  );
  const matchedGroups = useMemo(() => {
    const groups = new Map<string, FiberOrder[]>();
    matchedOrders.forEach((order) => {
      const name = order.repName || 'Unknown rep';
      groups.set(name, [...(groups.get(name) ?? []), order]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matchedOrders]);
  const unmatchedAssignmentGroups = useMemo(() => {
    const groups = new Map<string, AssignmentGroup>();
    unmatchedOrders.forEach((order) => {
      const repName = order.repName || 'Unknown rep';
      const dealerId = order.repDealerId || '';
      const key = `${order.repName}\u0000${order.repDealerId}`;
      const existing = groups.get(key);
      groups.set(key, existing ?? { key, repName, dealerId, orders: [] });
      groups.get(key)!.orders.push(order);
    });
    return [...groups.values()].sort((a, b) => a.repName.localeCompare(b.repName) || a.dealerId.localeCompare(b.dealerId));
  }, [unmatchedOrders]);
  const updated = relativeReportDate(data?.lastReportAt ?? null);
  const isAdmin = data?.scope === 'all';

  const loadUsers = useCallback(async () => {
    if (usersLoaded || usersLoading) return;

    setUsersLoading(true);
    setUsersError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/auth/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const responseData = await response.json() as { users?: PortalUser[]; error?: string };
      if (!response.ok) throw new Error(responseData.error || 'Failed to fetch portal users');

      const nextUsers = (responseData.users ?? [])
        .filter((user): user is PortalUser => Boolean(user?.uid))
        .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
      setUsers(nextUsers);
      setUsersLoaded(true);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to fetch portal users');
    } finally {
      setUsersLoading(false);
    }
  }, [usersLoaded, usersLoading]);

  const toggleGroup = useCallback((groupKey: string) => {
    const opening = !openGroups.has(groupKey);
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
    if (opening && groupKey.startsWith('unmatched:')) void loadUsers();
  }, [loadUsers, openGroups]);

  const postAssignmentAction = useCallback(async (body: Record<string, string>) => {
    const token = await getIdToken();
    const response = await fetch('/api/portal/sales/status/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const responseData = await response.json() as { error?: string };
    if (!response.ok) throw new Error(responseData.error || 'Failed to update install status assignments');
  }, []);

  const handleRematch = useCallback(async () => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setRematching(true);
    setRematchError(null);
    try {
      await postAssignmentAction({ action: 'rematch' });
      // Fresh: the order cache is invalidated only on the instance that served
      // the write, so a cached read here can hand back the pre-write snapshot
      // and make the action look like it did nothing.
      await refetch({ fresh: true });
    } catch (err) {
      setRematchError(err instanceof Error ? err.message : 'Failed to re-run matching');
    } finally {
      setRematching(false);
      mutationInFlightRef.current = false;
    }
  }, [postAssignmentAction, refetch]);

  const handleAssign = useCallback(async (assignment: AssignmentGroup) => {
    const userId = selectedUsers[assignment.key];
    if (!userId || mutationInFlightRef.current) return;

    mutationInFlightRef.current = true;
    setAssigningKey(assignment.key);
    setAssignmentErrors((current) => {
      const next = { ...current };
      delete next[assignment.key];
      return next;
    });
    try {
      await postAssignmentAction({ action: 'assign', dealerId: assignment.dealerId, userId });
      await refetch({ fresh: true });
      setSelectedUsers((current) => {
        const next = { ...current };
        delete next[assignment.key];
        return next;
      });
    } catch (err) {
      setAssignmentErrors((current) => ({
        ...current,
        [assignment.key]: err instanceof Error ? err.message : 'Failed to assign install statuses',
      }));
    } finally {
      setAssigningKey(null);
      mutationInFlightRef.current = false;
    }
  }, [postAssignmentAction, refetch, selectedUsers]);

  if (!isAdmin) return null;

  return (
    <section className="sales-line-fiber" aria-label="Install status">
      <div className="sales-line-fiber-head">
        <div>
          <h2>Install status by rep</h2>
          {updated && <p className="sales-line-fiber-updated">Updated {updated}</p>}
        </div>
      </div>

      {loading ? (
        <div className="sales-line-fiber-list sales-line-fiber-loading" aria-busy="true" aria-label="Loading install status">
          {[1, 2, 3].map((item) => <span key={item} className="sales-skeleton sales-skeleton-row sales-line-fiber-skeleton-row" />)}
        </div>
      ) : error ? (
        <p className="sales-line-fiber-message" role="alert">Install status is unavailable right now.</p>
      ) : allOrders.length === 0 ? (
        <p className="sales-line-fiber-message">No install report data for you yet. Statuses appear here once the daily provider report includes your sales.</p>
      ) : (
        isAdmin ? (
          <>
          <div className="sales-line-fiber-filters" role="group" aria-label="Filter install status">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className="sales-line-fiber-chip"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label} <span>({counts[key]})</span>
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <p className="sales-line-fiber-message">No install statuses match this filter.</p>
          ) : (
            <div className="sales-line-fiber-groups">
              {matchedGroups.map(([repName, orders]) => (
                <section className="sales-line-fiber-group" key={repName} aria-label={`${repName}, ${orders.length} orders`}>
                  <button
                    type="button"
                    className="sales-line-fiber-group-head"
                    aria-expanded={openGroups.has(`matched:${repName}`)}
                    aria-controls={groupDomId(`matched:${repName}`)}
                    onClick={() => toggleGroup(`matched:${repName}`)}
                  >
                    <span className="sales-line-fiber-group-head-main">
                      <strong>{repName}</strong>
                      <span className="sales-line-fiber-group-count">{orders.length} orders</span>
                    </span>
                    <span className="sales-line-fiber-group-head-side">
                      <span className="sales-line-fiber-summary">{statusSummary(orders)}</span>
                      <span className="sales-line-fiber-chevron" aria-hidden="true">⌄</span>
                    </span>
                  </button>
                  {openGroups.has(`matched:${repName}`) && (
                    <div id={groupDomId(`matched:${repName}`)}>
                      <FiberRows orders={orders} />
                    </div>
                  )}
                </section>
              ))}
              {unmatchedAssignmentGroups.length > 0 && (
                <>
                  <div className="sales-line-fiber-unmatched-divider">
                    <span>Not linked to an account yet</span>
                    <button type="button" className="sales-line-fiber-action" onClick={() => void handleRematch()} disabled={rematching || Boolean(assigningKey)}>
                      {rematching ? 'Matching…' : 'Re-run matching'}
                    </button>
                  </div>
                  {rematchError && <p className="sales-line-fiber-inline-error" role="alert">{rematchError}</p>}
                  {unmatchedAssignmentGroups.map((assignment) => {
                    const groupKey = `unmatched:${assignment.key}`;
                    return (
                      <section className="sales-line-fiber-group" key={assignment.key} aria-label={`${assignment.repName}, ${assignment.orders.length} orders`}>
                        <button
                          type="button"
                          className="sales-line-fiber-group-head"
                          aria-expanded={openGroups.has(groupKey)}
                          aria-controls={groupDomId(groupKey)}
                          onClick={() => toggleGroup(groupKey)}
                        >
                          <span className="sales-line-fiber-group-head-main">
                            <strong>{assignment.repName}</strong>
                            <span className="sales-line-fiber-group-count">{assignment.orders.length} orders</span>
                          </span>
                          <span className="sales-line-fiber-group-head-side">
                            <span className="sales-line-fiber-summary">{statusSummary(assignment.orders)}</span>
                            <span className="sales-line-fiber-chevron" aria-hidden="true">⌄</span>
                          </span>
                        </button>
                        {openGroups.has(groupKey) && (
                          <div id={groupDomId(groupKey)}>
                            <div className="sales-line-fiber-assignments">
                              {usersLoading && <p className="sales-line-fiber-assignment-note">Loading portal users…</p>}
                              {usersError && <p className="sales-line-fiber-inline-error" role="alert">{usersError}</p>}
                              <div className="sales-line-fiber-assignment">
                                <div className="sales-line-fiber-assignment-label">
                                  <strong>{assignment.repName} — {assignment.orders.length} orders</strong>
                                  {!assignment.dealerId && <span>no dealer id in report</span>}
                                </div>
                                {assignment.dealerId && (
                                  <>
                                    <select
                                      aria-label={`Assign ${assignment.repName}`}
                                      value={selectedUsers[assignment.key] ?? ''}
                                      onChange={(event) => setSelectedUsers((current) => ({ ...current, [assignment.key]: event.target.value }))}
                                      disabled={usersLoading || rematching || Boolean(assigningKey)}
                                    >
                                      <option value="">Select portal user</option>
                                      {users.map((user) => <option key={user.uid} value={user.uid}>{user.displayName || user.uid}</option>)}
                                    </select>
                                    <button
                                      type="button"
                                      className="sales-line-fiber-action"
                                      onClick={() => void handleAssign(assignment)}
                                      disabled={!selectedUsers[assignment.key] || rematching || Boolean(assigningKey)}
                                    >
                                      {assigningKey === assignment.key ? 'Assigning…' : 'Assign'}
                                    </button>
                                  </>
                                )}
                                {assignmentErrors[assignment.key] && (
                                  <p className="sales-line-fiber-inline-error" role="alert">{assignmentErrors[assignment.key]}</p>
                                )}
                              </div>
                            </div>
                            <FiberRows orders={assignment.orders} />
                          </div>
                        )}
                      </section>
                    );
                  })}
                </>
              )}
            </div>
          )}
          </>
        ) : null
      )}
    </section>
  );
}

function InstallStatusSectionFallback() {
  const fiber = useFiberStatus();
  return <InstallStatusSectionContent fiber={fiber} />;
}

export function InstallStatusSection({ fiber }: { fiber?: FiberStatusHookResult }) {
  return fiber ? <InstallStatusSectionContent fiber={fiber} /> : <InstallStatusSectionFallback />;
}
