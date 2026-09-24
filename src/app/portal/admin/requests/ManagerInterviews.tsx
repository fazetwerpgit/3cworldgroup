'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminQueue, QueueRow, queueValue } from '@/components/portal/admin-ops/AdminQueue';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

type Row = Record<string, unknown> & { id: string; status: string; signatureDataUrl?: string };

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

export function ManagerInterviews() {
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

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const markHandled = async (id: string) => {
    const res = await authedFetch('/api/portal/forms/manager-interview/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('Failed to mark handled');
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => queueValue(r.provider)).filter((c) => c !== '—'))).sort(),
    [rows]
  );

  const queueRows: QueueRow[] = useMemo(
    () =>
      rows.map((row) => {
        const candidate = `${queueValue(row.candidateFirstName)} ${queueValue(row.candidateLastName)}`.replace('— —', '—').trim();
        return {
          id: row.id,
          status: row.status === 'handled' ? 'handled' : 'new',
          person: queueValue(row.repName),
          personSub: queueValue(row.hiringManager),
          subject: candidate,
          subjectSub: queueValue(row.jobPosition),
          secondary: queueValue(row.provider),
          secondarySub: queueValue(row.market),
          evidenceKind: row.signatureDataUrl ? 'signature' : 'none',
          signatureUrl: row.signatureDataUrl,
          detailTitle: `${queueValue(row.jobPosition)} interview`,
          detailFields: [
            { label: 'Candidate', value: candidate },
            { label: 'Hiring manager', value: queueValue(row.hiringManager) },
            { label: 'Provider', value: queueValue(row.provider) },
            { label: 'Market', value: queueValue(row.market) },
            { label: 'Did show', value: queueValue(row.didShow) },
            { label: 'Offer', value: queueValue(row.extendOffer) },
            { label: 'Rating', value: queueValue(row.rating) },
            { label: 'Submitted', value: queueValue(row.createdAt) },
          ],
          searchText: [row.repName, row.candidateFirstName, row.candidateLastName, row.provider]
            .map(queueValue)
            .join(' ')
            .toLowerCase(),
          filterValue: queueValue(row.provider),
        };
      }),
    [rows]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <AdminQueue
        title="Manager Interviews"
        lede="Interview notes from managers. Record the next step."
        columns={['Submitted by', 'Candidate', 'Provider']}
        itemNoun="Manager interview"
        searchPlaceholder="Search by rep, candidate or provider"
        rows={queueRows}
        loading={loading}
        error={error}
        onRetry={retry}
        onMarkHandled={markHandled}
        filterLabel="Provider"
        filterOptions={providers}
        downloadFilename="manager-interviews.csv"
        csvColumns={COLUMNS}
        csvRows={rows}
        emptyBody="No manager interviews need review right now."
      />
    </ProtectedRoute>
  );
}
