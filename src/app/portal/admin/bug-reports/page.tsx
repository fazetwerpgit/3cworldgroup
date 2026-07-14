'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import OpsQueueList, { OpsQueueRowVM, opsFormatValue } from '@/components/forms/OpsQueueList';
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

  const markHandled = async (id: string) => {
    const res = await authedFetch('/api/portal/forms/bug-report/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        personSub: opsFormatValue(row.repEmail),
        subject: opsFormatValue(row.summary),
        subjectSub: opsFormatValue(row.area),
        secondary: opsFormatValue(row.pageUrl),
        secondarySub: 'Bug report',
        evidenceKind: 'none',
        detailFields: [
          { label: 'Area', value: opsFormatValue(row.area) },
          { label: 'Details', value: opsFormatValue(row.details) },
          { label: 'Page', value: opsFormatValue(row.pageUrl) },
          { label: 'Submitted', value: opsFormatValue(row.createdAt) },
        ],
        searchText: [row.repName, row.summary, row.area].map(opsFormatValue).join(' ').toLowerCase(),
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
            intro="Reproduce, triage, and send the right signal to product."
            itemsLabel="items need action"
            rows={queueRows}
            loading={loading}
            error={error}
            downloadFilename="bug-reports.csv"
            csvColumns={COLUMNS}
            csvRows={rows}
            onMarkHandled={markHandled}
            emptyStateTitle="Nothing to review"
            emptyStateBody="No bug reports need review right now."
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
