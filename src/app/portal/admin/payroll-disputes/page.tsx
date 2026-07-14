'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import OpsQueueList, { OpsQueueRowVM, opsFormatValue } from '@/components/forms/OpsQueueList';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; orderScreenshotPath?: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Submitted by' },
  { key: 'contractorName', label: 'Contractor' },
  { key: 'contractorEmail', label: 'Email' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'typeOfOrder', label: 'Order Type' },
  { key: 'dateOfInstall', label: 'Install Date' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function PayrollDisputesReviewPage() {
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
      const res = await authedFetch('/api/portal/forms/payroll-dispute/review');
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
    const res = await authedFetch('/api/portal/forms/payroll-dispute/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const viewScreenshot = useCallback(
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
      rows.map((row) => ({
        id: row.id,
        status: row.status === 'handled' ? 'handled' : 'new',
        person: opsFormatValue(row.repName),
        personSub: opsFormatValue(row.contractorName),
        subject: opsFormatValue(row.typeOfOrder),
        subjectSub: opsFormatValue(row.dateOfInstall),
        secondary: opsFormatValue(row.campaign),
        secondarySub: 'Payroll dispute',
        evidenceKind: row.orderScreenshotPath ? 'files' : 'none',
        evidenceItems: row.orderScreenshotPath
          ? [{ label: 'screenshot', onClick: () => viewScreenshot(row.orderScreenshotPath as string) }]
          : undefined,
        detailFields: [
          { label: 'Contractor', value: opsFormatValue(row.contractorName) },
          { label: 'Contractor email', value: opsFormatValue(row.contractorEmail) },
          { label: 'Campaign', value: opsFormatValue(row.campaign) },
          { label: 'Install date', value: opsFormatValue(row.dateOfInstall) },
        ],
        searchText: [row.repName, row.contractorName, row.typeOfOrder].map(opsFormatValue).join(' ').toLowerCase(),
        filterValue: opsFormatValue(row.campaign),
      })),
    [rows, viewScreenshot]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <OpsQueueList
            kicker="02 / The Line / evidence relay"
            heroWord="Call"
            heroRest="the proof."
            intro="A single row keeps the person, campaign, age, status, and evidence in view. Expand only when the decision needs the full case."
            itemsLabel="items need action"
            rows={queueRows}
            loading={loading}
            error={error}
            downloadFilename="payroll-disputes.csv"
            csvColumns={COLUMNS}
            csvRows={rows}
            filterLabel="Campaign"
            filterOptions={campaigns}
            onMarkHandled={markHandled}
            emptyStateTitle="Nothing to review"
            emptyStateBody="No payroll disputes need review right now."
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
