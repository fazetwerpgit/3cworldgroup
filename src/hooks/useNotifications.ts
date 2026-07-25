'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Notification } from '@/types/notifications';
import { isAbortError } from '@/lib/fetch/isAbortError';
import { getIdToken } from '@/lib/firebase/getIdToken';

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

  const fetchNotifications = useCallback(async (limit = 20) => {
    if (!user) return;

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
      }
    } catch (error) {
      // Ignore abort errors
      if (!mountedRef.current || isAbortError(error, controller.signal)) return;
      console.error('Error fetching notifications:', error);
    } finally {
      if (abortControllerRef.current === controller) setLoading(false);
    }
  }, [user]);

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

  const clearAll = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/portal/notifications', {
        method: 'DELETE',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: user.uid }),
      });

      if (response.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }, [user]);

  // Fetch notifications on mount and periodically
  useEffect(() => {
    mountedRef.current = true;
    if (user) {
      fetchNotifications();

      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        fetchNotifications();
      }, 30000);

      return () => {
        mountedRef.current = false;
        clearInterval(interval);
        // Cancel any in-flight request on unmount
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }
  }, [user, fetchNotifications]);

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
