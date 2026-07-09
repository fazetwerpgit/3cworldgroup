'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Notification } from '@/types/notifications';
import { isAbortError } from '@/lib/fetch/isAbortError';

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
        `/api/portal/notifications?userId=${user.uid}&limit=${limit}&requestedBy=${user.uid}`,
        { signal: controller.signal }
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: idsToMark, requestedBy: user.uid }),
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, markAllRead: true, requestedBy: user.uid }),
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, requestedBy: user.uid }),
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
