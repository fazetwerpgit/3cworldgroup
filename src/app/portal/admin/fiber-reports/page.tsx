'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Rep' },
  { key: 'companySold', label: 'Company' },
  { key: 'dateKnocked', label: 'Date Knocked' },
  { key: 'packNumber', label: 'Pack #' },
  { key: 'numberOfReps', label: 'Reps' },
  { key: 'doorsKnocked', label: 'Doors' },
  { key: 'customerContacts', label: 'Contacts' },
  { key: 'numberOfSales', label: 'Sales' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function FiberReportsReviewPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/fiber-report/review', {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch('/api/portal/forms/fiber-report/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <ReviewList
        title="Fiber Reports"
        columns={COLUMNS}
        rows={rows}
        onMarkHandled={markHandled}
        loading={loading}
        error={error}
        downloadFilename="fiber-reports.csv"
      />
    </ProtectedRoute>
  );
}
