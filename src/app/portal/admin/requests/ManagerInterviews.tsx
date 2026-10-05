'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminQueue, QueueField, QueueRow, queueValue } from '@/components/portal/admin-ops/AdminQueue';
import { useMarkHandled } from '@/components/portal/admin-ops/useMarkHandled';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

type Row = Record<string, unknown> & { id: string; status: string; signatureDataUrl?: string };

const COLUMNS = [
  { key: 'repName', label: 'Submitted by' },
  { key: 'candidateFirstName', label: 'Candidate first name' },
  { key: 'candidateLastName', label: 'Candidate last name' },
  { key: 'candidateEmail', label: 'Candidate email' },
  { key: 'provider', label: 'Provider' },
  { key: 'jobPosition', label: 'Position' },
  { key: 'hiringManager', label: 'Manager' },
  { key: 'hiringManagerEmail', label: 'Manager email' },
  { key: 'market', label: 'Market' },
  { key: 'didShow', label: 'Show?' },
  { key: 'extendOffer', label: 'Offer?' },
  { key: 'rating', label: 'Rating' },
  { key: 'completedProduction', label: 'Promotion: production?' },
  { key: 'completedReading', label: 'Promotion: reading?' },
  { key: 'completedTeamMetric', label: 'Promotion: team metric?' },
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

  const markHandled = useMarkHandled('/api/portal/forms/manager-interview/review', (id) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)))
  );

  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => queueValue(r.provider)).filter((c) => c !== '—'))).sort(),
    [rows]
  );

  const queueRows: QueueRow[] = useMemo(
    () =>
      rows.map((row) => {
        const candidate = `${queueValue(row.candidateFirstName)} ${queueValue(row.candidateLastName)}`.replace('— —', '—').trim();
        // Promotion answers are stored only for promotion roles ('' otherwise).
        const promotion: QueueField[] = [
          { label: 'Promotion: production', value: queueValue(row.completedProduction) },
          { label: 'Promotion: reading', value: queueValue(row.completedReading) },
          { label: 'Promotion: team metric', value: queueValue(row.completedTeamMetric) },
        ].filter((field) => field.value !== '—');
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
            { label: 'Candidate email', value: queueValue(row.candidateEmail) },
            { label: 'Hiring manager', value: queueValue(row.hiringManager) },
            { label: 'Hiring manager email', value: queueValue(row.hiringManagerEmail) },
            { label: 'Provider', value: queueValue(row.provider) },
            { label: 'Market', value: queueValue(row.market) },
            { label: 'Did show', value: queueValue(row.didShow) },
            { label: 'Offer', value: queueValue(row.extendOffer) },
            { label: 'Rating', value: queueValue(row.rating) },
            ...promotion,
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
