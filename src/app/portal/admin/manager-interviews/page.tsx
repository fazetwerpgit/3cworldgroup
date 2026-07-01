'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
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
      const res = await authedFetch('/api/portal/forms/manager-interview/review');
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
    const res = await authedFetch('/api/portal/forms/manager-interview/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="space-y-4">
        <ReviewList
          title="Manager Interviews"
          columns={COLUMNS}
          rows={rows}
          onMarkHandled={markHandled}
          loading={loading}
          error={error}
          downloadFilename="manager-interviews.csv"
        />
        {rows.some((r) => r.signatureDataUrl) && (
          <div className="mx-auto max-w-[1500px] space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Signatures</p>
            {rows.filter((r) => r.signatureDataUrl).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-700">
                  {String(r.candidateFirstName ?? r.id)} {String(r.candidateLastName ?? '')}
                </span>
                <img
                  src={r.signatureDataUrl as string}
                  alt="Signature"
                  className="h-24 rounded border border-slate-200 bg-white"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
