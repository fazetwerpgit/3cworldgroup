'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { FiberOrder, Sale } from '@/types';
import type { MergedRow } from '@/lib/sales/mergeBook';
import { FiberRows, sortFiberOrders } from './InstallStatusSection';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// The two admin-only actions the merged board needs and the shell does not
// already own: assigning a whole dealer's unmatched orders to a portal user
// (the EXISTING dealer-scoped action, unchanged — same endpoint, same body),
// and linking one carrier order to one logged sale.

type PortalUser = { uid: string; displayName?: string | null };

type DealerGroup = { key: string; repName: string; dealerId: string; orders: FiberOrder[] };

/**
 * The unassigned drawer. Orders the carrier sent whose dealer id matches no
 * portal user: they cannot sit in a rep's list because nobody knows whose they
 * are, so they get their own list and the dealer assign control that fixes it.
 */
export function UnassignedOrders({ rows, onAssigned }: { rows: MergedRow[]; onAssigned: () => Promise<void> | void }) {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // One group per dealer id, because the assign action is dealer-scoped: it
  // stamps every order that dealer ever sent, not the one row you clicked.
  const groups = useMemo<DealerGroup[]>(() => {
    const byDealer = new Map<string, DealerGroup>();
    for (const row of rows) {
      const order = row.order;
      if (!order) continue;
      const repName = order.repName || 'Unknown rep';
      const dealerId = order.repDealerId || '';
      const key = `${repName} ${dealerId}`;
      let group = byDealer.get(key);
      if (!group) {
        group = { key, repName, dealerId, orders: [] };
        byDealer.set(key, group);
      }
      group.orders.push(order);
    }
    return [...byDealer.values()]
      .map((group) => ({ ...group, orders: sortFiberOrders(group.orders) }))
      .sort((a, b) => a.repName.localeCompare(b.repName) || a.dealerId.localeCompare(b.dealerId));
  }, [rows]);

  // The drawer is already open by the time this renders, so the user list is
  // fetched on mount rather than behind a second click.
  useEffect(() => {
    let active = true;
    setUsersLoading(true);
    void (async () => {
      try {
        const token = await getIdToken();
        const response = await fetch('/api/portal/auth/users', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json() as { users?: PortalUser[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Failed to fetch portal users');
        if (!active) return;
        setUsers((data.users ?? [])
          .filter((user): user is PortalUser => Boolean(user?.uid))
          .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '')));
      } catch (err) {
        if (active) setUsersError(err instanceof Error ? err.message : 'Failed to fetch portal users');
      } finally {
        if (active) setUsersLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const assign = useCallback(async (group: DealerGroup) => {
    const userId = selected[group.key];
    if (!userId || assigningKey) return;
    setAssigningKey(group.key);
    setErrors((current) => {
      const next = { ...current };
      delete next[group.key];
      return next;
    });
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/sales/status/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'assign', dealerId: group.dealerId, userId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to assign install statuses');
      await onAssigned();
    } catch (err) {
      setErrors((current) => ({
        ...current,
        [group.key]: err instanceof Error ? err.message : 'Failed to assign install statuses',
      }));
    } finally {
      setAssigningKey(null);
    }
  }, [assigningKey, onAssigned, selected]);

  return (
    <div className="sales-board-drawer-body">
      {usersLoading && <p className="sales-board-assign-note">Loading portal users...</p>}
      {usersError && <p className="sales-board-assign-error" role="alert">{usersError}</p>}

      {groups.map((group) => (
        <section className="sales-board-assign" key={group.key} aria-label={`${group.repName}, ${group.orders.length} orders`}>
          <div className="sales-board-assign-row">
            <span className="sales-board-assign-label">
              <strong>{group.repName}</strong>
              <span>
                {group.orders.length} order{group.orders.length === 1 ? '' : 's'}
                {group.dealerId ? ` / dealer ${group.dealerId}` : ' / no dealer id in report'}
              </span>
            </span>
            {group.dealerId && (
              <>
                <select
                  aria-label={`Assign ${group.repName}`}
                  value={selected[group.key] ?? ''}
                  onChange={(event) => setSelected((current) => ({ ...current, [group.key]: event.target.value }))}
                  disabled={usersLoading || Boolean(assigningKey)}
                >
                  <option value="">Select portal user</option>
                  {users.map((user) => <option key={user.uid} value={user.uid}>{user.displayName || user.uid}</option>)}
                </select>
                <button
                  type="button"
                  className="sales-board-rowact-btn"
                  onClick={() => void assign(group)}
                  disabled={!selected[group.key] || Boolean(assigningKey)}
                >
                  {assigningKey === group.key ? 'Assigning' : 'Assign'}
                </button>
              </>
            )}
          </div>
          {errors[group.key] && <p className="sales-board-assign-error" role="alert">{errors[group.key]}</p>}
          <FiberRows orders={group.orders} />
        </section>
      ))}
    </div>
  );
}

/**
 * "Which sale is this?" for one carrier order nobody logged. The picker offers
 * that rep's sales across EVERY month, not the month on screen: a sale logged
 * on the 30th against an order dated the 2nd of the next month is exactly the
 * case the address guess misses, and a month-scoped picker could never reach
 * it. The likely match is sorted to the top and each row carries its month.
 * "Not a sale" is the other real answer, and it has to be offered: it is what
 * stops the address guess re-claiming the order tomorrow morning.
 */
export function LinkOrderDialog({
  row,
  candidates,
  onClose,
  onLinked,
}: {
  row: MergedRow | null;
  /** That rep's sales, best guess first, each with the month it was sold. */
  candidates: Array<{ sale: Sale; hint: string }>;
  onClose: () => void;
  onLinked: () => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState('');

  const rowKey = row?.key ?? null;
  useEffect(() => {
    setChoice('');
    setError(null);
  }, [rowKey]);

  const submit = useCallback(async (saleId: string | null) => {
    const orderId = row?.order?.id;
    if (!orderId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/sales/status/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orderId, saleId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to link this order');
      await onLinked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link this order');
    } finally {
      setSaving(false);
    }
  }, [onClose, onLinked, row?.order?.id, saving]);

  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row?.linkBroken ? 'Re-link this order' : 'Which sale is this?'}</DialogTitle>
          <DialogDescription>
            {row?.linkBroken
              ? `${row?.address || 'This order'} is linked to a sale, but the link isn't active — pick the sale again, or say it is not one of ours. Nothing will re-join it until you do.`
              : `${row?.address || 'This order'} is in the carrier report but nobody logged it. Point it at the sale it belongs to, or say it is not one of ours. Either answer stops the address guess deciding for you.`}
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="sales-board-assign-note">
            {row?.repName || 'This rep'} has no sales on the books at all, in any month.
            Marking it as not a sale is the only answer available here.
          </p>
        ) : (
          <label className="sales-board-reason">
            <span>Sale</span>
            <select
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              disabled={saving}
              aria-label="Sale to link this order to"
            >
              <option value="">Select a sale</option>
              {candidates.map(({ sale, hint }) => (
                <option key={sale.id} value={sale.id || ''}>
                  {sale.customerName || sale.customerAddress || 'Customer pending'}
                  {sale.customerAddress && sale.customerName ? ` - ${sale.customerAddress}` : ''}
                  {hint ? ` (${hint})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="sales-board-assign-error" role="alert">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Close</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void submit(null)}>
            Not a sale
          </Button>
          <Button type="button" disabled={saving || !choice} onClick={() => void submit(choice)}>
            {saving ? 'Linking' : 'Link sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
