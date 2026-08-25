'use client';

import { useMemo, useState } from 'react';
import { useFiberStatus } from '@/hooks/useFiberStatus';
import type { FiberOrder, FiberOrderStatus } from '@/types';

type FiberFilter = 'all' | 'pending' | 'active' | 'cancelled' | 'attention';

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

function statusGroup(status: FiberOrderStatus): FiberFilter {
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

function sortOrders(orders: FiberOrder[]) {
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

function FiberStatusPill({ status }: { status: FiberOrderStatus }) {
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

  return (
    <article className="sales-line-fiber-row">
      <div className="sales-line-fiber-row-primary">
        <div className="sales-line-fiber-address">
          <strong>{order.address || 'Address unavailable'}</strong>
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

function FiberRows({ orders, showRepName = false }: { orders: FiberOrder[]; showRepName?: boolean }) {
  return (
    <div className="sales-line-fiber-list">
      {orders.map((order) => <FiberOrderRow key={order.id} order={order} showRepName={showRepName} />)}
    </div>
  );
}

export function InstallStatusSection() {
  const { data, loading, error } = useFiberStatus();
  const [filter, setFilter] = useState<FiberFilter>('all');

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
    () => sortOrders(allOrders.filter((order) => filter === 'all' || statusGroup(order.status) === filter)),
    [allOrders, filter]
  );
  const matchedOrders = useMemo(
    () => sortOrders((data?.orders ?? []).filter((order) => filter === 'all' || statusGroup(order.status) === filter)),
    [data?.orders, filter]
  );
  const unmatchedOrders = useMemo(
    () => sortOrders((data?.unmatched ?? []).filter((order) => filter === 'all' || statusGroup(order.status) === filter)),
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
  const updated = relativeReportDate(data?.lastReportAt ?? null);
  const isAdmin = data?.scope === 'all';

  return (
    <section className="sales-line-fiber" aria-label="Install status">
      <div className="sales-line-fiber-head">
        <div>
          <p className="sales-line-eyebrow">Provider report / install status</p>
          <h2>Where your sales actually stand</h2>
        </div>
        {updated && <p className="sales-line-fiber-updated">Updated {updated}</p>}
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
          ) : isAdmin ? (
            <div className="sales-line-fiber-groups">
              {matchedGroups.map(([repName, orders]) => (
                <section className="sales-line-fiber-group" key={repName} aria-label={`${repName}, ${orders.length} orders`}>
                  <div className="sales-line-fiber-group-head"><strong>{repName}</strong><span>{orders.length}</span></div>
                  <FiberRows orders={orders} />
                </section>
              ))}
              {unmatchedOrders.length > 0 && (
                <section className="sales-line-fiber-group" aria-label={`Unmatched reps, ${unmatchedOrders.length} orders`}>
                  <div className="sales-line-fiber-group-head"><strong>Unmatched reps</strong><span>{unmatchedOrders.length}</span></div>
                  <FiberRows orders={unmatchedOrders} showRepName />
                </section>
              )}
            </div>
          ) : (
            <FiberRows orders={filteredOrders} />
          )}
        </>
      )}
    </section>
  );
}
