'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { Button } from '@/components/ui/button';
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

function hasAttachment(row: Row) {
  return Boolean(row.hostileUploadPath || row.blindKnockUploadPath || row.lassoUploadPath);
}

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

  const viewAttachment = async (path: string) => {
    const res = await authedFetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="space-y-4">
        <ReviewList
          title="Leads Requests"
          columns={COLUMNS}
          rows={rows}
          onMarkHandled={markHandled}
          loading={loading}
          error={error}
          downloadFilename="leads-requests.csv"
        />
        {rows.some(hasAttachment) && (
          <div className="mx-auto max-w-[1500px] space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Attachments</p>
            {rows.filter(hasAttachment).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-700 dark:text-muted-foreground">{String(r.repFirstName ?? r.id)}</span>
                {r.hostileUploadPath && (
                  <Button type="button" variant="outline" onClick={() => viewAttachment(r.hostileUploadPath as string)}>
                    View hostile
                  </Button>
                )}
                {r.blindKnockUploadPath && (
                  <Button type="button" variant="outline" onClick={() => viewAttachment(r.blindKnockUploadPath as string)}>
                    View blind-knock
                  </Button>
                )}
                {r.lassoUploadPath && (
                  <Button type="button" variant="outline" onClick={() => viewAttachment(r.lassoUploadPath as string)}>
                    View lasso
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
