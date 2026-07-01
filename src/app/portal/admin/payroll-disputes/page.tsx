'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { Button } from '@/components/ui/button';
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

  const viewScreenshot = async (path: string) => {
    const res = await authedFetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer');
  };

  // Decorate rows with a screenshot action via an extra column rendered by ReviewList?
  // ReviewList only renders text columns + Mark handled. To add "View screenshot",
  // pass a synthetic column whose value is a clickable hint, and render the button
  // by wrapping: simplest is to add a 'screenshot' column showing 'View' and handle
  // the click below the list. Implement a thin wrapper instead:

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="space-y-4">
        <ReviewList
          title="Payroll Disputes"
          columns={COLUMNS}
          rows={rows}
          onMarkHandled={markHandled}
          loading={loading}
          error={error}
          downloadFilename="payroll-disputes.csv"
        />
        {rows.some((r) => r.orderScreenshotPath) && (
          <div className="mx-auto max-w-[1500px] space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Screenshots</p>
            {rows.filter((r) => r.orderScreenshotPath).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-700">{String(r.contractorName ?? r.id)}</span>
                <Button type="button" variant="outline" onClick={() => viewScreenshot(r.orderScreenshotPath as string)}>
                  View screenshot
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
