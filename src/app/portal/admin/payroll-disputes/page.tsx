'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminQueue, QueueRow, queueValue } from '@/components/portal/admin-ops/AdminQueue';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { openAttachmentInNewTab } from '@/lib/forms/openAttachment';

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

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const markHandled = async (id: string) => {
    const res = await authedFetch('/api/portal/forms/payroll-dispute/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('Failed to mark handled');
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  // Not async: openAttachmentInNewTab must open its tab synchronously inside the
  // click (iOS Safari drops window.open after an await).
  const viewScreenshot = useCallback(
    (path: string) =>
      openAttachmentInNewTab(async () => {
        const res = await authedFetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error(`Attachment request failed (${res.status})`);
        const json = await res.json();
        return typeof json.url === 'string' ? json.url : null;
      }),
    [authedFetch]
  );

  const campaigns = useMemo(
    () => Array.from(new Set(rows.map((r) => queueValue(r.campaign)).filter((c) => c !== '—'))).sort(),
    [rows]
  );

  const queueRows: QueueRow[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        status: row.status === 'handled' ? 'handled' : 'new',
        person: queueValue(row.repName),
        personSub: queueValue(row.contractorName),
        subject: queueValue(row.typeOfOrder),
        subjectSub: queueValue(row.contractorName),
        secondary: queueValue(row.dateOfInstall),
        secondarySub: queueValue(row.createdAt),
        evidenceKind: row.orderScreenshotPath ? 'files' : 'none',
        evidenceItems: row.orderScreenshotPath
          ? [{ label: 'screenshot', onClick: () => viewScreenshot(row.orderScreenshotPath as string) }]
          : undefined,
        detailFields: [
          { label: 'Contractor', value: queueValue(row.contractorName) },
          { label: 'Contractor email', value: queueValue(row.contractorEmail) },
          { label: 'Campaign', value: queueValue(row.campaign) },
          { label: 'Install date', value: queueValue(row.dateOfInstall) },
        ],
        searchText: [row.repName, row.contractorName, row.typeOfOrder].map(queueValue).join(' ').toLowerCase(),
        filterValue: queueValue(row.campaign),
      })),
    [rows, viewScreenshot]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <AdminQueue
        title="Payroll Disputes"
        lede="Pay questions submitted by reps."
        columns={['Rep', 'Dispute', 'Install date']}
        itemNoun="Payroll dispute"
        searchPlaceholder="Search by rep, contractor or order type"
        rows={queueRows}
        loading={loading}
        error={error}
        onRetry={retry}
        onMarkHandled={markHandled}
        filterLabel="Campaign"
        filterOptions={campaigns}
        downloadFilename="payroll-disputes.csv"
        csvColumns={COLUMNS}
        csvRows={rows}
        emptyBody="No payroll disputes need review right now."
      />
    </ProtectedRoute>
  );
}
