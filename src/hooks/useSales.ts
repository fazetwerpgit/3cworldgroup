'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useCacheSubject } from '@/lib/cache/useCacheSubject';
import {
  awaitPendingDataCacheRead,
  dataCacheGeneration,
  invalidateAfterSaleWrite,
  readDataCacheEntry,
  writeDataCache,
} from '@/lib/cache/dataCache';
import { Sale, SaleStatus, CreateSaleData } from '@/types';
import type { OrderDuplicate } from '@/lib/sales/orderNumber';
import { todaySaleDateInput } from '@/lib/sales/saleDate';

interface SalesFilters {
  status?: SaleStatus;
  salesRepId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export const NO_SIGNAL_SALE_MESSAGE = 'No signal. Your entry is saved, tap Submit to retry.';

/**
 * A submit on one bar of signal can hang with no answer. Past this it is
 * treated as no signal: the entry stays saved and the retry reuses the same
 * clientSaleId, so a request that did land comes back as that sale.
 */
export const SALE_SUBMIT_TIMEOUT_MS = 45_000;

export type CreateSaleResult =
  | {
      sale: Sale;
      /**
       * The server already had a sale under this clientSaleId and returned it
       * instead of writing a new one. The caller must say so, never treat it as a
       * fresh sale: the entry on screen may be a different customer.
       */
      duplicate: boolean;
      orderDuplicate?: undefined;
    }
  | {
      /**
       * Nothing was written: a live sale already carries this order number.
       * The rep can resubmit with allowDuplicate to log it anyway.
       */
      orderDuplicate: OrderDuplicate;
      sale?: undefined;
      duplicate?: undefined;
    };

/**
 * True for a failure that never got a usable answer from the server: fetch
 * rejecting (Safari "Load failed", Chrome "Failed to fetch", Firefox
 * "NetworkError…"), a Firebase token refresh that could not reach Google
 * ("auth/network-request-failed"), or a truncated/non-JSON body, which Safari reports from
 * response.json() as "The string did not match the expected pattern".
 */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /load failed|failed to fetch|networkerror|network-request-failed|network connection was lost|did not match the expected pattern|internet connection appears to be offline|unexpected end of json/i.test(
    message
  );
}

/** The list query for these filters (also the list's cache key). */
export function salesQuery(filters?: SalesFilters): string {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.salesRepId) params.append('salesRepId', filters.salesRepId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  return params.toString();
}

/** Rejects as soon as `signal` aborts, so an untimed wait (a token refresh) honors the submit timeout. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    work.then(resolve, reject);
  });
}

export type CachedSales = { sales: Sale[]; truncated: boolean };
const listCacheKey = (query: string) => `sales?${query}`;
/** The cache key of the list for these filters (the tab prefetch fills it too). */
export const salesListCacheKey = (filters?: SalesFilters) => listCacheKey(salesQuery(filters));

/**
 * Sales list and writes. `seed` (the filters the caller is about to fetch)
 * fills the list from the last visit's copy at once; `seeded` says it did, so
 * the caller can skip its skeleton and refresh in the background.
 */
export function useSales(seed?: SalesFilters | null) {
  const uid = useCacheSubject();
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);
  const [seededEntry] = useState(() =>
    seed ? readDataCacheEntry<CachedSales>(uid, listCacheKey(salesQuery(seed))) : undefined
  );
  const seeded = seededEntry?.value;
  // The query (and whose list, under which account generation, fetched when)
  // the list on screen came from, so local edits keep that cached copy current
  // without restamping it, and never write it under another user.
  const listKey = useRef<{ key: string; subject: string | null; gen: number; at: number } | null>(
    seed && seededEntry
      ? { key: listCacheKey(salesQuery(seed)), subject: uid, gen: dataCacheGeneration(), at: seededEntry.at }
      : null
  );
  const [sales, setSales] = useState<Sale[]>(() => seeded?.sales ?? []);
  // The list query hit its cap and this book is short. Rows cut this way are
  // missing from every month AND their carrier orders come back as red "never
  // logged" rows, so the board has to be able to say the figures are partial.
  const [truncated, setTruncated] = useState(() => seeded?.truncated ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The newest fetchSales call. An older one that answers later (the filters
  // changed while it was in flight) must not overwrite the newer list.
  const fetchSeq = useRef(0);
  // A fetchSales call raised `loading` and no call has lowered it yet.
  const fetchLoading = useRef(false);

  // Deletes and cancellations patch the list in place: keep its cached copy in step.
  // The seeded list is the cached copy itself: writing it back would only restamp it.
  useEffect(() => {
    const list = listKey.current;
    if (!list) return;
    if (seeded && sales === seeded.sales && truncated === seeded.truncated) return;
    writeDataCache<CachedSales>(list.subject, list.key, { sales, truncated }, list.gen, list.at);
  }, [sales, truncated, seeded]);

  /**
   * `quiet` reloads without touching what is on screen: no loading flag, and a
   * failure keeps the current list (and any earlier error) instead of flagging
   * a new one. For the refresh when the app is reopened.
   * `background` refreshes a list shown from cache: no loading flag (no
   * skeleton), but a failure still lands in `error`.
   */
  const fetchSales = useCallback(async (
    filters?: SalesFilters,
    { quiet = false, background = false }: { quiet?: boolean; background?: boolean } = {}
  ) => {
    const seq = ++fetchSeq.current;
    const superseded = () => seq !== fetchSeq.current;
    if (!quiet && !background) {
      fetchLoading.current = true;
      setLoading(true);
      setError(null);
      setTruncated(false);
    }

    const gen = dataCacheGeneration();
    const subject = uidRef.current;
    try {
      const query = salesQuery(filters);

      // The tab prefetch is already reading this list: use its answer.
      const prefetched = await awaitPendingDataCacheRead<CachedSales>(subject, listCacheKey(query));
      if (superseded()) return;
      if (prefetched && gen === dataCacheGeneration()) {
        listKey.current = { key: listCacheKey(query), subject, gen, at: prefetched.at };
        setSales(prefetched.value.sales);
        setTruncated(prefetched.value.truncated === true);
        setError(null);
        return;
      }

      // The list endpoint requires a verified login (sales carry customer PII).
      const token = await getIdToken();
      const response = await fetch(`/api/portal/sales?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch sales');
      }
      if (superseded()) return;

      // An answer from before an account switch never becomes the cached copy.
      listKey.current =
        gen === dataCacheGeneration() ? { key: listCacheKey(query), subject, gen, at: Date.now() } : null;
      setSales(data.sales);
      setTruncated(data.truncated === true);
      setError(null);
    } catch (err) {
      if (superseded()) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch sales';
      if (quiet) console.error('Quiet sales refresh failed:', message);
      else setError(message);
    } finally {
      // Only the newest call ends the loading state, also one an older,
      // superseded call raised.
      if (!superseded() && fetchLoading.current) {
        fetchLoading.current = false;
        setLoading(false);
      }
    }
  }, []);

  const fetchSale = useCallback(async (id: string): Promise<Sale | null> => {
    setLoading(true);
    setError(null);

    try {
      // The route compares the sale's stored salesRepId against the token uid.
      const token = await getIdToken();
      const response = await fetch(`/api/portal/sales/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
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

  /**
   * Null when the network or the server said no; the reason lands in `error`
   * and, for a caller sending several sales in a row, in `onError` too.
   */
  const createSale = useCallback(async (
    saleData: CreateSaleData,
    { onError }: { onError?: (message: string) => void } = {}
  ): Promise<CreateSaleResult | null> => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      // The create endpoint requires a verified token and stamps the rep from it.
      // The timeout covers the token refresh too: after an hour in the
      // background it is a network call that can hang on weak signal.
      timer = setTimeout(() => controller.abort(), SALE_SUBMIT_TIMEOUT_MS);
      const token = await untilAborted(getIdToken(), controller.signal);
      const response = await fetch('/api/portal/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // clientToday: the phone's own day, so an Eastern rep after midnight
        // ET may date a sale today (the server allows one day past Chicago's).
        body: JSON.stringify({ ...saleData, clientToday: todaySaleDateInput() }),
        signal: controller.signal,
      });
      const data = await response.json();

      // Not an error: the form shows who logged this order and lets the rep
      // decide. Nothing was written.
      if (response.status === 409 && data?.duplicateOrder === true) {
        return {
          orderDuplicate: {
            existingSaleId: typeof data.existingSaleId === 'string' ? data.existingSaleId : null,
            existingRepName: typeof data.existingRepName === 'string' ? data.existingRepName : '',
            existingSaleDate: typeof data.existingSaleDate === 'string' ? data.existingSaleDate : null,
            existingCustomerFirstName:
              typeof data.existingCustomerFirstName === 'string' ? data.existingCustomerFirstName : '',
            existingIsMine: data.existingIsMine === true,
          },
        };
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create sale');
      }

      invalidateAfterSaleWrite(uidRef.current);
      return { sale: data.sale, duplicate: data.duplicate === true };
    } catch (err) {
      const message =
        controller.signal.aborted || isNetworkFailure(err)
          ? NO_SIGNAL_SALE_MESSAGE
          : err instanceof Error
            ? err.message
            : 'Failed to create sale';
      setError(message);
      onError?.(message);
      return null;
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  const updateSale = useCallback(async (
    id: string,
    // saleDate/installDate are sent as YYYY-MM-DD strings; the API parses them server-side.
    updates: Partial<Omit<Sale, 'saleDate' | 'installDate'>> & { saleDate?: string; installDate?: string },
    // The hook's `error` state lands after the await returns, too late for a
    // caller that shows the server's reason inline (status is unset on a
    // network failure).
    options: { onError?: (message: string, status?: number) => void } = {}
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    let status: number | undefined;

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/portal/sales/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...updates, clientToday: todaySaleDateInput() }),
      });
      status = response.status;
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update sale');
      }

      invalidateAfterSaleWrite(uidRef.current);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update sale';
      setError(message);
      options.onError?.(message, status);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSale = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/portal/sales/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete sale');
      }

      invalidateAfterSaleWrite(uidRef.current);
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

  /**
   * Cancel a sale the customer backed out of, or undo that cancellation.
   * The row stays on the books either way — this only moves its status, which
   * is what drops it out of totals, the install pipeline and pay.
   */
  const setSaleCancelled = useCallback(async (
    id: string,
    cancelled: boolean,
    reason?: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/portal/sales/${id}/cancel`, {
        method: cancelled ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(cancelled ? { body: JSON.stringify({ reason: reason || '' }) } : {}),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || (cancelled ? 'Failed to cancel sale' : 'Failed to restore sale'));
      }

      invalidateAfterSaleWrite(uidRef.current);
      // Patch in place rather than refetching: the board is scoped to a month
      // and a refetch would flash the whole list for a one-field change.
      setSales((prev) =>
        prev.map((sale) =>
          sale.id === id
            ? {
                ...sale,
                status: cancelled ? 'cancelled' : 'approved',
                cancelledAt: cancelled ? new Date() : undefined,
                cancelReason: cancelled ? reason || '' : undefined,
              }
            : sale
        )
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update sale';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    seeded: seeded !== undefined,
    sales,
    truncated,
    loading,
    error,
    fetchSales,
    fetchSale,
    createSale,
    updateSale,
    deleteSale,
    setSaleCancelled,
  };
}
