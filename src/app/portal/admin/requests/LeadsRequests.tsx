'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminQueue, QueueEvidence, QueueField, QueueRow, queueValue } from '@/components/portal/admin-ops/AdminQueue';
import { useMarkHandled } from '@/components/portal/admin-ops/useMarkHandled';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useAttachmentViewer } from '@/components/portal/rep/ImageViewer';

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
  { key: 'managerEmail', label: 'Manager email' },
  { key: 'repFirstName', label: 'Rep first name' },
  { key: 'repLastName', label: 'Rep last name' },
  { key: 'location', label: 'Location' },
  { key: 'specialRequest', label: 'Special request' },
  { key: 'category', label: 'Category' },
  { key: 'leadPackCode', label: 'Lead pack code' },
  { key: 'reason', label: 'Reason' },
  { key: 'situationDescription', label: 'Situation' },
  { key: 'newRepPhone', label: 'New rep phone' },
  { key: 'newRepEmail', label: 'New rep email' },
  { key: 'createdAt', label: 'Submitted' },
];

export function LeadsRequests() {
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

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const markHandled = useMarkHandled('/api/portal/forms/leads-request/review', (id) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)))
  );

  // In-app viewer, not a new tab: a tab strands an iPhone home-screen app.
  const viewer = useAttachmentViewer();
  const openViewer = viewer.open;
  const viewAttachment = useCallback(
    (path: string, label: string) =>
      openViewer(
        async () => {
          const res = await authedFetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
          if (!res.ok) throw new Error(`Attachment request failed (${res.status})`);
          const json = await res.json();
          return typeof json.url === 'string' ? json.url : null;
        },
        label
      ),
    [authedFetch, openViewer]
  );

  const campaigns = useMemo(
    () => Array.from(new Set(rows.map((r) => queueValue(r.campaign)).filter((c) => c !== '—'))).sort(),
    [rows]
  );

  const queueRows: QueueRow[] = useMemo(
    () =>
      rows.map((row) => {
        const evidenceItems: QueueEvidence[] = [];
        if (row.hostileUploadPath) {
          evidenceItems.push({ label: 'hostile', onClick: () => viewAttachment(row.hostileUploadPath as string, 'Hostile upload') });
        }
        if (row.blindKnockUploadPath) {
          evidenceItems.push({
            label: 'blind-knock',
            onClick: () => viewAttachment(row.blindKnockUploadPath as string, 'Blind-knock upload'),
          });
        }
        if (row.lassoUploadPath) {
          evidenceItems.push({ label: 'lasso', onClick: () => viewAttachment(row.lassoUploadPath as string, 'Lasso upload') });
        }
        const repFull = [row.repFirstName, row.repLastName].filter(Boolean).join(' ');
        // Only the follow-up fields the rep's answers opened.
        const conditional: QueueField[] = [
          { label: 'Special request', value: queueValue(row.specialRequest), wide: true },
          { label: 'Lead pack code', value: queueValue(row.leadPackCode) },
          { label: 'Situation', value: queueValue(row.situationDescription), wide: true },
          { label: 'New rep phone', value: queueValue(row.newRepPhone) },
          { label: 'New rep email', value: queueValue(row.newRepEmail) },
        ].filter((field) => field.value !== '—');
        return {
          id: row.id,
          status: row.status === 'handled' ? 'handled' : 'new',
          person: queueValue(row.repName),
          personSub: queueValue(repFull),
          subject: queueValue(row.category),
          subjectSub: queueValue(row.location),
          secondary: queueValue(row.createdAt),
          secondarySub: queueValue(row.campaign),
          evidenceKind: evidenceItems.length > 0 ? 'files' : 'none',
          evidenceItems,
          detailFields: [
            { label: 'Manager', value: queueValue(row.managerName) },
            { label: 'Manager email', value: queueValue(row.managerEmail) },
            { label: 'Rep', value: queueValue(repFull) },
            { label: 'Location', value: queueValue(row.location) },
            { label: 'Category', value: queueValue(row.category) },
            { label: 'Reason', value: queueValue(row.reason) },
            ...conditional,
          ],
          searchText: [row.repName, row.repFirstName, row.repLastName, row.campaign, row.location]
            .map(queueValue)
            .join(' ')
            .toLowerCase(),
          filterValue: queueValue(row.campaign),
        };
      }),
    [rows, viewAttachment]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <>
        <AdminQueue
          title="Leads Requests"
          lede="Lead requests to route to the right manager."
          columns={['Submitted by', 'Request', 'Submitted']}
          itemNoun="Leads request"
          searchPlaceholder="Search by rep, campaign or location"
          rows={queueRows}
          loading={loading}
          error={error}
          onRetry={retry}
          onMarkHandled={markHandled}
          filterLabel="Campaign"
          filterOptions={campaigns}
          downloadFilename="leads-requests.csv"
          csvColumns={COLUMNS}
          csvRows={rows}
          emptyBody="No leads requests need review right now."
        />
        {viewer.viewer}
      </>
    </ProtectedRoute>
  );
}
