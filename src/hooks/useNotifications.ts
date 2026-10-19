'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Notification } from '@/types/notifications';
import { isAbortError } from '@/lib/fetch/isAbortError';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { PAGE_DATA_FALLBACK_MS, waitForPageData } from '@/lib/cache/pageData';
import { startBellPoller } from '@/lib/notifications/bellPoll';

// The notifications route verifies the caller from the ID token. userId stays on
// the wire as the TARGET bell being read/cleared — the route allows self or
// management — but the acting identity is never client-supplied.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // The poll compares the server's unread count with this one and only
  // re-reads the list when they differ (lib/notifications/bellPoll).
  const unreadRef = useRef<number | null>(null);
  useEffect(() => {
    unreadRef.current = unreadCount;
  }, [unreadCount]);
  const listLoadedRef = useRef(false);

  /** Resolves false when the read failed (the poll then backs off). */
  const fetchNotifications = useCallback(async (limit = 20): Promise<boolean> => {
    if (!user) return false;

    // Cancel any in-flight request. Some browsers report an aborted fetch as a
    // TypeError rather than an AbortError, so keep the local controller for the
    // catch/finally checks below.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/portal/notifications?userId=${user.uid}&limit=${limit}`,
        { signal: controller.signal, headers: await authHeaders() }
      );
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        unreadRef.current = data.unreadCount;
        listLoadedRef.current = true;
        return true;
      }
      return false;
    } catch (error) {
      // Ignore abort errors
      if (!mountedRef.current || isAbortError(error, controller.signal)) return true;
      console.error('Error fetching notifications:', error);
      return false;
    } finally {
      if (abortControllerRef.current === controller) setLoading(false);
    }
  }, [user]);

  // One poll: the unread count alone (a count() aggregation, ~1 read), and the
  // list only when that count moved or the list was never loaded.
  const pollNotifications = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    if (!listLoadedRef.current) return fetchNotifications();
    try {
      const response = await fetch(
        `/api/portal/notifications?userId=${user.uid}&countOnly=true`,
        { headers: await authHeaders() }
      );
      if (!response.ok) return false;
      const data = await response.json();
      if (typeof data.unreadCount !== 'number') return false;
      if (data.unreadCount === unreadRef.current) return true;
      return fetchNotifications();
    } catch (error) {
      if (!mountedRef.current) return true;
      console.error('Error polling notifications:', error);
      return false;
    }
  }, [user, fetchNotifications]);

  const markAsRead = useCallback(async (notificationIds: string[]) => {
    if (!user) return;

    // Filter out IDs that are already being processed (prevent double-clicks)
    const idsToMark = notificationIds.filter(id => !markingRead.has(id));
    if (idsToMark.length === 0) return;

    // Track which IDs are being processed
    setMarkingRead(prev => {
      const next = new Set(prev);
      idsToMark.forEach(id => next.add(id));
      return next;
    });

    try {
      const response = await fetch('/api/portal/notifications', {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({ notificationIds: idsToMark }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            idsToMark.includes(n.id) ? { ...n, read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - idsToMark.length));
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    } finally {
      // Remove from tracking set
      setMarkingRead(prev => {
        const next = new Set(prev);
        idsToMark.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [user, markingRead]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/portal/notifications', {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: user.uid, markAllRead: true }),
      });

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, [user]);

  /** Resolves false when nothing was cleared, so the caller can say so. */
  const clearAll = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const response = await fetch('/api/portal/notifications', {
        method: 'DELETE',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: user.uid }),
      });

      if (response.ok) {
        setNotifications([]);
        setUnreadCount(0);
        return true;
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
    return false;
  }, [user]);

  // Fetch on mount, then poll every 90 s while the page is visible (paused
  // while hidden, one refresh on return). See lib/notifications/bellPoll.
  useEffect(() => {
    mountedRef.current = true;
    if (user) {
      listLoadedRef.current = false;
      // The first poll waits for the page's own data (a cold open on LTE),
      // then the bell poller takes over (90 s, paused while hidden).
      const firstRead = new AbortController();
      let stop: (() => void) | null = null;
      void waitForPageData({ fallbackMs: PAGE_DATA_FALLBACK_MS, signal: firstRead.signal }).then(() => {
        if (mountedRef.current && !firstRead.signal.aborted) stop = startBellPoller({ tick: pollNotifications });
      });

      return () => {
        mountedRef.current = false;
        firstRead.abort();
        stop?.();
        // Cancel any in-flight request on unmount
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }
  }, [user, pollNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
}
