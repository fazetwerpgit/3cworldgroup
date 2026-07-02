'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { Sale, SaleStatus, CreateSaleData } from '@/types';

/**
 * Resolve a fresh ID token, waiting for Firebase auth to finish restoring the
 * session if needed — grabbing auth.currentUser too early races on first load.
 */
async function getIdToken(): Promise<string | null> {
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser.getIdToken();
  return new Promise((resolve) => {
    const unsubscribe = auth!.onAuthStateChanged((firebaseUser) => {
      unsubscribe();
      resolve(firebaseUser ? firebaseUser.getIdToken() : null);
    });
  });
}

interface SalesFilters {
  status?: SaleStatus;
  salesRepId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface SalesStats {
  totalSales: number;
  totalValue: number;
  totalCommission: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  averageValue: number;
  salesChange: number;
  valueChange: number;
}

export function useSales() {
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = useCallback(async (filters?: SalesFilters) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.salesRepId) params.append('salesRepId', filters.salesRepId);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.limit) params.append('limit', filters.limit.toString());

      // The list endpoint requires a verified login (sales carry customer PII).
      const token = await getIdToken();
      const response = await fetch(`/api/portal/sales?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch sales');
      }

      setSales(data.sales);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sales';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSale = useCallback(async (id: string): Promise<Sale | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/portal/sales/${id}?requestedBy=${user?.uid ?? ''}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch sale');
      }

      return data.sale;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sale';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createSale = useCallback(async (saleData: CreateSaleData): Promise<Sale | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/portal/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saleData),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create sale');
      }

      return data.sale;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create sale';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSale = useCallback(async (id: string, updates: Partial<Sale>): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/portal/sales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, requestedBy: user?.uid }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update sale');
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update sale';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const deleteSale = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/portal/sales/${id}?requestedBy=${user?.uid ?? ''}`,
        { method: 'DELETE' }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete sale');
      }

      setSales((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete sale';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const approveSale = useCallback(async (
    saleId: string,
    status: 'approved' | 'rejected',
    approverId: string,
    approverName?: string,
    rejectionReason?: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/portal/sales/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          status,
          approverId,
          approverName,
          rejectionReason,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process sale');
      }

      // Update local state
      setSales((prev) =>
        prev.map((s) => (s.id === saleId ? { ...s, status } : s))
      );

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process sale';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async (
    period?: 'day' | 'week' | 'month' | 'year',
    salesRepId?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (period) params.append('period', period);
      if (salesRepId) params.append('salesRepId', salesRepId);
      if (user?.uid) params.append('requestedBy', user.uid);

      const response = await fetch(`/api/portal/sales/stats?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch stats');
      }

      setStats(data.stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch stats';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  return {
    sales,
    stats,
    loading,
    error,
    fetchSales,
    fetchSale,
    createSale,
    updateSale,
    deleteSale,
    approveSale,
    fetchStats,
  };
}
