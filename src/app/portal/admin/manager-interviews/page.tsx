'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import OpsQueueList, { OpsQueueRowVM, opsFormatValue } from '@/components/forms/OpsQueueList';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; signatureDataUrl?: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Submitted by' },
  { key: 'candidateFirstName', label: 'Candidate' },
  { key: 'provider', label: 'Provider' },
  { key: 'jobPosition', label: 'Position' },
  { key: 'hiringManager', label: 'Manager' },
  { key: 'market', label: 'Market' },
  { key: 'didShow', label: 'Show?' },
  { key: 'extendOffer', label: 'Offer?' },
  { key: 'rating', label: 'Rating' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function ManagerInterviewsReviewPage() {
  const { user, isRole } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` } });
  }, []);

  const load = useCallback(async () => {
    // ProtectedRoute only gates rendering — skip the fetch for roles that are
    // about to be redirected so unauthorized loads stay silent (no 403 noise).
    if (!user || !isRole('admin', 'operations')) return;
    try {
      const res = await authedFetch('/api/portal/forms/manager-interview/review');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user, isRole, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const markHandled = async (id: string) => {
    const res = await authedFetch('/api/portal/forms/manager-interview/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => opsFormatValue(r.provider)).filter((c) => c !== '—'))).sort(),
    [rows]
  );

  const queueRows: OpsQueueRowVM[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        status: row.status === 'handled' ? 'handled' : 'new',
        person: opsFormatValue(row.repName),
        personSub: opsFormatValue(row.hiringManager),
        subject: opsFormatValue(row.jobPosition),
        subjectSub: `${opsFormatValue(row.candidateFirstName)} ${opsFormatValue(row.candidateLastName)}`.trim(),
        secondary: opsFormatValue(row.provider),
        secondarySub: opsFormatValue(row.market),
        evidenceKind: row.signatureDataUrl ? 'signature' : 'none',
        signatureUrl: row.signatureDataUrl,
        detailFields: [
          { label: 'Hiring manager', value: opsFormatValue(row.hiringManager) },
          { label: 'Did show', value: opsFormatValue(row.didShow) },
          { label: 'Extend offer', value: opsFormatValue(row.extendOffer) },
          { label: 'Rating', value: opsFormatValue(row.rating) },
        ],
        searchText: [row.repName, row.candidateFirstName, row.candidateLastName, row.provider]
          .map(opsFormatValue)
          .join(' ')
          .toLowerCase(),
        filterValue: opsFormatValue(row.provider),
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
            intro="Keep interview notes and next steps moving together — signature confirms the final step."
            itemsLabel="items need action"
            rows={queueRows}
            loading={loading}
            error={error}
            downloadFilename="manager-interviews.csv"
            csvColumns={COLUMNS}
            csvRows={rows}
            filterLabel="Provider"
            filterOptions={providers}
            onMarkHandled={markHandled}
            emptyStateTitle="Nothing to review"
            emptyStateBody="No manager interviews need review right now."
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
