'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import OpsQueueList, { OpsQueueRowVM, opsFormatValue } from '@/components/forms/OpsQueueList';
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

export default function FiberReportsReviewPage() {
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

  const markHandled = async (id: string) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch('/api/portal/forms/fiber-report/review', {
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
        personSub: opsFormatValue(row.companySold),
        subject: opsFormatValue(row.orderNumber),
        subjectSub: opsFormatValue(row.dateKnocked),
        secondary: `Pack ${opsFormatValue(row.packNumber)}`,
        secondarySub: `${opsFormatValue(row.numberOfSales)} sales`,
        evidenceKind: 'none',
        detailFields: [
          { label: 'Reps', value: opsFormatValue(row.numberOfReps) },
          { label: 'Doors knocked', value: opsFormatValue(row.doorsKnocked) },
          { label: 'Contacts', value: opsFormatValue(row.customerContacts) },
          { label: 'Submitted', value: opsFormatValue(row.createdAt) },
        ],
        searchText: [row.repName, row.companySold, row.orderNumber].map(opsFormatValue).join(' ').toLowerCase(),
      })),
    [rows]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <OpsQueueList
            kicker="02 / The Line / evidence relay"
            heroWord="Call"
            heroRest="the proof."
            intro="Fiber field reports awaiting review before commission can move."
            itemsLabel="items need action"
            rows={queueRows}
            loading={loading}
            error={error}
            downloadFilename="fiber-reports.csv"
            csvColumns={COLUMNS}
            csvRows={rows}
            onMarkHandled={markHandled}
            emptyStateTitle="Nothing to review"
            emptyStateBody="No fiber reports need review right now."
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
