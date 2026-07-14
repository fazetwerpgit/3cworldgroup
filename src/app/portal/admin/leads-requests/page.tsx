'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import OpsQueueList, { OpsQueueEvidenceItem, OpsQueueRowVM, opsFormatValue } from '@/components/forms/OpsQueueList';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row {
  id: string;
  status: string;
  hostileUploadPath?: string;
  blindKnockUploadPath?: string;
  lassoUploadPath?: string;
  [key: string]: unknown;
}

const COLUMNS = [
  { key: 'repName', label: 'Submitted by' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'managerName', label: 'Manager' },
  { key: 'repFirstName', label: 'Rep' },
  { key: 'location', label: 'Location' },
  { key: 'category', label: 'Category' },
  { key: 'reason', label: 'Reason' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function LeadsRequestsReviewPage() {
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
      const res = await authedFetch('/api/portal/forms/leads-request/review');
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
    const res = await authedFetch('/api/portal/forms/leads-request/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const viewAttachment = useCallback(
    async (path: string) => {
      const res = await authedFetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer');
    },
    [authedFetch]
  );

  const campaigns = useMemo(
    () => Array.from(new Set(rows.map((r) => opsFormatValue(r.campaign)).filter((c) => c !== '—'))).sort(),
    [rows]
  );

  const queueRows: OpsQueueRowVM[] = useMemo(
    () =>
      rows.map((row) => {
        const evidenceItems: OpsQueueEvidenceItem[] = [];
        if (row.hostileUploadPath) {
          evidenceItems.push({ label: 'hostile', onClick: () => viewAttachment(row.hostileUploadPath as string) });
        }
        if (row.blindKnockUploadPath) {
          evidenceItems.push({
            label: 'blind-knock',
            onClick: () => viewAttachment(row.blindKnockUploadPath as string),
          });
        }
        if (row.lassoUploadPath) {
          evidenceItems.push({ label: 'lasso', onClick: () => viewAttachment(row.lassoUploadPath as string) });
        }
        return {
          id: row.id,
          status: row.status === 'handled' ? 'handled' : 'new',
          person: opsFormatValue(row.repName),
          personSub: opsFormatValue(row.repFirstName),
          subject: opsFormatValue(row.category),
          subjectSub: opsFormatValue(row.location),
          secondary: opsFormatValue(row.campaign),
          secondarySub: opsFormatValue(row.managerName),
          evidenceKind: evidenceItems.length > 0 ? 'files' : 'none',
          evidenceItems,
          detailFields: [
            { label: 'Manager', value: opsFormatValue(row.managerName) },
            { label: 'Rep', value: opsFormatValue(row.repFirstName) },
            { label: 'Location', value: opsFormatValue(row.location) },
            { label: 'Category', value: opsFormatValue(row.category) },
            { label: 'Reason', value: opsFormatValue(row.reason) },
          ],
          searchText: [row.repName, row.repFirstName, row.campaign, row.location]
            .map(opsFormatValue)
            .join(' ')
            .toLowerCase(),
          filterValue: opsFormatValue(row.campaign),
        };
      }),
    [rows, viewAttachment]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <OpsQueueList
            kicker="02 / The Line / evidence relay"
            heroWord="Call"
            heroRest="the proof."
            intro="Route fresh lead asks to the right manager — up to three field-proof uploads per request."
            itemsLabel="items need action"
            rows={queueRows}
            loading={loading}
            error={error}
            downloadFilename="leads-requests.csv"
            csvColumns={COLUMNS}
            csvRows={rows}
            filterLabel="Campaign"
            filterOptions={campaigns}
            onMarkHandled={markHandled}
            emptyStateTitle="Nothing to review"
            emptyStateBody="No leads requests need review right now."
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
