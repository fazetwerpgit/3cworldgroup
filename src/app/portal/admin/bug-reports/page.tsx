'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Reported by' },
  { key: 'area', label: 'Area' },
  { key: 'summary', label: 'Summary' },
  { key: 'details', label: 'Details' },
  { key: 'pageUrl', label: 'Page' },
  { key: 'repEmail', label: 'Email' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function BugReportsReviewPage() {
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
      const res = await authedFetch('/api/portal/forms/bug-report/review');
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
    const res = await authedFetch('/api/portal/forms/bug-report/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <ReviewList
        title="Bug Reports"
        columns={COLUMNS}
        rows={rows}
        onMarkHandled={markHandled}
        loading={loading}
        error={error}
        downloadFilename="bug-reports.csv"
      />
    </ProtectedRoute>
  );
}
