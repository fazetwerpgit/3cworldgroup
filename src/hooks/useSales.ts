'use client';

import { useState, useCallback } from 'react';
import { Sale, SaleStatus, CreateSaleData } from '@/types';

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

      const response = await fetch(`/api/portal/sales?${params.toString()}`);
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
      const response = await fetch(`/api/portal/sales/${id}`);
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
  }, []);

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
        body: JSON.stringify(updates),
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
  }, []);

  const deleteSale = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/portal/sales/${id}`, {
        method: 'DELETE',
      });
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
  }, []);

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
  }, []);

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
