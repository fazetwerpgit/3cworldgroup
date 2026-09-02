'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import OpsQueueList, { OpsQueueRowVM, opsFormatValue } from '@/components/forms/OpsQueueList';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-admin-b.css';

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

export default function ExpediteOrdersReviewPage() {
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

  const markHandled = async (id: string) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch('/api/portal/forms/expedite-order/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const queueRows: OpsQueueRowVM[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        status: row.status === 'handled' ? 'handled' : 'new',
        person: opsFormatValue(row.repName),
        personSub: opsFormatValue(row.customerName),
        subject: opsFormatValue(row.customerName),
        subjectSub: opsFormatValue(row.orderNumber),
        secondary: opsFormatValue(row.createdAt),
        secondarySub: opsFormatValue(row.expediteDates),
        evidenceKind: 'none',
        detailFields: [
          { label: 'Phone', value: opsFormatValue(row.customerPhone) },
          { label: 'Email', value: opsFormatValue(row.customerEmail) },
          { label: 'Address', value: `${opsFormatValue(row.address)}, ${opsFormatValue(row.zip)}` },
          { label: 'Expedite dates', value: opsFormatValue(row.expediteDates) },
        ],
        searchText: [row.repName, row.customerName, row.orderNumber].map(opsFormatValue).join(' ').toLowerCase(),
      })),
    [rows]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <PageTitle title="Expedite Orders" meta={`${rows.filter((row) => row.status !== 'handled').length} open`} />
          <OpsQueueList
            kicker="Expedite Orders"
            heroWord="Expedite"
            heroRest="Orders"
            intro="Review customer orders that need faster scheduling."
            itemsLabel="open"
            rows={queueRows}
            loading={loading}
            error={error}
            downloadFilename="expedite-orders.csv"
            csvColumns={COLUMNS}
            csvRows={rows}
            onMarkHandled={markHandled}
            emptyStateTitle="Nothing to review"
            emptyStateBody="No expedite orders need review right now."
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
