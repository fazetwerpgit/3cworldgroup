'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminQueue, QueueRow, queueValue } from '@/components/portal/admin-ops/AdminQueue';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Reported by' },
  { key: 'area', label: 'Area' },
  { key: 'summary', label: 'Summary' },
  { key: 'details', label: 'Details' },
  { key: 'pageUrl', label: 'Page' },
  { key: 'repEmail', label: 'Email' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function BugReportsReviewPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` } });
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/portal/forms/bug-report/review');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const markHandled = async (id: string) => {
    const res = await authedFetch('/api/portal/forms/bug-report/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        personSub: queueValue(row.repEmail),
        subject: queueValue(row.summary),
        subjectSub: queueValue(row.area),
        secondary: queueValue(row.createdAt),
        secondarySub: queueValue(row.pageUrl),
        evidenceKind: 'none',
        detailFields: [
          { label: 'Area', value: queueValue(row.area) },
          { label: 'Details', value: queueValue(row.details) },
          { label: 'Page', value: queueValue(row.pageUrl) },
          { label: 'Submitted', value: queueValue(row.createdAt) },
        ],
        searchText: [row.repName, row.summary, row.area].map(queueValue).join(' ').toLowerCase(),
      })),
    [rows]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <AdminQueue
        title="Bug Reports"
        lede="Issues reported by reps."
        columns={['Reported by', 'Issue', 'Submitted']}
        itemNoun="Bug report"
        searchPlaceholder="Search by rep, issue or area"
        rows={queueRows}
        loading={loading}
        error={error}
        onRetry={retry}
        onMarkHandled={markHandled}
        downloadFilename="bug-reports.csv"
        csvColumns={COLUMNS}
        csvRows={rows}
        emptyBody="No bug reports need review right now."
      />
    </ProtectedRoute>
  );
}
