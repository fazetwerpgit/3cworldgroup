'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Notification } from '@/types/notifications';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchNotifications = useCallback(async (limit = 20) => {
    if (!user) return;

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const response = await fetch(
        `/api/portal/notifications?userId=${user.uid}&limit=${limit}`,
        { signal: abortControllerRef.current.signal }
      );
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
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
        headers: { 'Content-Type': 'application/json' },
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

  // Fetch notifications on mount and periodically
  useEffect(() => {
    if (user) {
      fetchNotifications();

      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        fetchNotifications();
      }, 30000);

      return () => {
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
  };
}
