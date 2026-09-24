'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminQueue, QueueRow, queueValue } from '@/components/portal/admin-ops/AdminQueue';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Rep' },
  { key: 'customerName', label: 'Customer' },
  { key: 'customerPhone', label: 'Phone' },
  { key: 'customerEmail', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'reason', label: 'Reason' },
  { key: 'expediteDates', label: 'Dates' },
  { key: 'createdAt', label: 'Submitted' },
];

export function ExpediteOrders() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/expedite-order/review', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const markHandled = async (id: string) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/portal/forms/expedite-order/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('Failed to mark handled');
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const queueRows: QueueRow[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        status: row.status === 'handled' ? 'handled' : 'new',
        person: queueValue(row.repName),
        personSub: queueValue(row.customerName),
        subject: queueValue(row.customerName),
        subjectSub: queueValue(row.orderNumber),
        secondary: queueValue(row.createdAt),
        secondarySub: queueValue(row.expediteDates),
        evidenceKind: 'none',
        detailFields: [
          { label: 'Order #', value: queueValue(row.orderNumber) },
          { label: 'Reason', value: queueValue(row.reason) },
          { label: 'Phone', value: queueValue(row.customerPhone) },
          { label: 'Email', value: queueValue(row.customerEmail) },
          { label: 'Address', value: `${queueValue(row.address)}, ${queueValue(row.zip)}` },
          { label: 'Expedite dates', value: queueValue(row.expediteDates) },
        ],
        searchText: [row.repName, row.customerName, row.orderNumber].map(queueValue).join(' ').toLowerCase(),
      })),
    [rows]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <AdminQueue
        title="Expedite Orders"
        lede="Customer orders that need faster scheduling."
        columns={['Rep', 'Customer', 'Submitted']}
        itemNoun="Expedite order"
        searchPlaceholder="Search by rep, customer or order #"
        rows={queueRows}
        loading={loading}
        error={error}
        onRetry={retry}
        onMarkHandled={markHandled}
        downloadFilename="expedite-orders.csv"
        csvColumns={COLUMNS}
        csvRows={rows}
        emptyBody="No expedite orders need review right now."
      />
    </ProtectedRoute>
  );
}
