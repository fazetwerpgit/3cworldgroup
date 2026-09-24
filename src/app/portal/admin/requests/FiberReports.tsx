'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminQueue, QueueRow, queueValue } from '@/components/portal/admin-ops/AdminQueue';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Rep' },
  { key: 'companySold', label: 'Company' },
  { key: 'dateKnocked', label: 'Date Knocked' },
  { key: 'packNumber', label: 'Pack #' },
  { key: 'numberOfReps', label: 'Reps' },
  { key: 'doorsKnocked', label: 'Doors' },
  { key: 'customerContacts', label: 'Contacts' },
  { key: 'numberOfSales', label: 'Sales' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'createdAt', label: 'Submitted' },
];

export function FiberReports() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/fiber-report/review', {
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
    const res = await fetch('/api/portal/forms/fiber-report/review', {
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
        personSub: queueValue(row.companySold),
        subject: queueValue(row.companySold),
        subjectSub: queueValue(row.orderNumber),
        secondary: queueValue(row.dateKnocked),
        secondarySub: queueValue(row.createdAt),
        evidenceKind: 'none',
        detailFields: [
          { label: 'Sales', value: queueValue(row.numberOfSales) },
          { label: 'Pack #', value: queueValue(row.packNumber) },
          { label: 'Reps', value: queueValue(row.numberOfReps) },
          { label: 'Doors knocked', value: queueValue(row.doorsKnocked) },
          { label: 'Contacts', value: queueValue(row.customerContacts) },
          { label: 'Submitted', value: queueValue(row.createdAt) },
        ],
        searchText: [row.repName, row.companySold, row.orderNumber].map(queueValue).join(' ').toLowerCase(),
      })),
    [rows]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <AdminQueue
        title="Fiber Reports"
        lede="Daily knock reports submitted by reps."
        columns={['Rep', 'Company', 'Date knocked']}
        itemNoun="Fiber report"
        searchPlaceholder="Search by rep, company or order #"
        rows={queueRows}
        loading={loading}
        error={error}
        onRetry={retry}
        onMarkHandled={markHandled}
        downloadFilename="fiber-reports.csv"
        csvColumns={COLUMNS}
        csvRows={rows}
        emptyBody="No fiber reports need review right now."
      />
    </ProtectedRoute>
  );
}
