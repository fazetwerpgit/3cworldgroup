'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { useAuth } from '@/contexts/AuthContext';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Rep' },
  { key: 'customerName', label: 'Customer' },
  { key: 'customerPhone', label: 'Phone' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'reason', label: 'Reason' },
  { key: 'expediteDates', label: 'Dates' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function ExpediteOrdersReviewPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/portal/forms/expedite-order/review?requestedBy=${user.uid}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const markHandled = async (id: string) => {
    if (!user) return;
    const res = await fetch('/api/portal/forms/expedite-order/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, requestedBy: user.uid }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <ReviewList title="Expedite Orders" columns={COLUMNS} rows={rows} onMarkHandled={markHandled} loading={loading} error={error} />
    </ProtectedRoute>
  );
}
